// planCapGuard: lifetime plan-cap enforcement for the applications-monitor
// backend. Mirrors flashfire-dashboard-backend/Utils/dailyCapGuard.js so BOTH
// backends agree on the same hard ceiling.
//
// Effective cap = base plan cap (or planLimit override) + addon bonus +
// referral bonus. Once a client's ACTIVE job count reaches the effective cap,
// NO new job can be created under that client — strict, no overshoot allowed.
//
//   base    : NewUserModel.planLimit (>0 override) else PLAN_CAPS[planType]
//   addons  : ClientModel(DashboardTracking).addons[] summed (.type/.addonType)
//   refs    : NewUserModel.referrals[]  Professional +200 / Executive +300
//
// Active jobs = JobModel docs whose currentStatus does NOT start with
// "deleted"/"removed" (matches dashboard countTotalJobs) — removed jobs free
// up headroom.

import { JobModel } from "../JobModel.js";
import { ClientModel } from "../ClientModel.js";
import { NewUserModel } from "../schema_models/UserModel.js";
import {
  getPlanCap,
  sumAddonApplications,
  referralApplicationsFor,
} from "./planCaps.js";

// readEffectiveCap(email) → { email, planType, baseCap, addonBonus,
// referralBonus, effectiveCap }. effectiveCap === null only when the client
// has no recognisable plan AND no planLimit override (uncapped — do no harm).
// Throws on bad input so caller can fail-closed.
export async function readEffectiveCap(rawEmail) {
  const email = String(rawEmail || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    const err = new Error("planCapGuard.readEffectiveCap: client email required");
    err.code = "BAD_INPUT";
    throw err;
  }
  const [user, client] = await Promise.all([
    NewUserModel.findOne(
      { email },
      { planType: 1, planLimit: 1, referrals: 1, referralStatus: 1 }
    ).lean(),
    ClientModel.findOne({ email }, { addons: 1, planType: 1 }).lean(),
  ]);

  // planType: prefer the user doc (authoritative for billing); fall back to
  // the tracking doc for legacy clients that only exist there.
  const planType = user?.planType || client?.planType || "";
  const planLimitRaw = Number(user?.planLimit);
  const planLimitOverride =
    Number.isFinite(planLimitRaw) && planLimitRaw > 0 ? planLimitRaw : null;
  const planDefault = getPlanCap(planType) || null;
  const baseCap = planLimitOverride ?? planDefault ?? null;

  const addonBonus = sumAddonApplications(client?.addons);

  // Referrals: new array path, with legacy single referralStatus fallback.
  let referralBonus = 0;
  const refs = Array.isArray(user?.referrals) ? user.referrals : [];
  if (refs.length > 0) {
    referralBonus = referralApplicationsFor(refs);
  } else if (user?.referralStatus) {
    referralBonus = referralApplicationsFor([{ plan: user.referralStatus }]);
  }

  const effectiveCap = baseCap == null ? null : baseCap + addonBonus + referralBonus;
  return { email, planType, baseCap, addonBonus, referralBonus, effectiveCap };
}

// countActiveJobs(email) → number of non-removed jobs across all roles.
export async function countActiveJobs(rawEmail) {
  const email = String(rawEmail || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    const err = new Error("planCapGuard.countActiveJobs: client email required");
    err.code = "BAD_INPUT";
    throw err;
  }
  return JobModel.countDocuments({
    userID: email,
    $or: [
      { currentStatus: { $exists: false } },
      { currentStatus: null },
      { currentStatus: { $not: /^(deleted|removed)/i } },
    ],
  });
}

// checkPlanCap(email) → { allowed, count, cap, planType, reason?, message?,
// baseCap, addonBonus, referralBonus }. allowed:true with cap:null = uncapped.
// Throws on DB error so caller can fail-closed.
export async function checkPlanCap(rawEmail) {
  const meta = await readEffectiveCap(rawEmail);
  const { email, planType, effectiveCap, baseCap, addonBonus, referralBonus } = meta;
  if (effectiveCap == null) {
    return { allowed: true, count: null, cap: null, planType, baseCap: null, addonBonus, referralBonus };
  }
  const count = await countActiveJobs(email);
  const parts = [`base ${baseCap}`];
  if (referralBonus > 0) parts.push(`+${referralBonus} referrals`);
  if (addonBonus > 0) parts.push(`+${addonBonus} addons`);
  const breakdown = parts.length > 1 ? ` (${parts.join(" ")})` : "";
  if (count >= effectiveCap) {
    return {
      allowed: false,
      count,
      cap: effectiveCap,
      planType,
      baseCap,
      addonBonus,
      referralBonus,
      reason: "PLAN_LIMIT_REACHED",
      message: `Plan limit reached: ${count}/${effectiveCap} applications${breakdown} for ${planType || "(no plan)"}. No more jobs can be added under this client. Add an addon/referral, upgrade the plan, or raise planLimit to continue.`,
    };
  }
  return {
    allowed: true,
    count,
    cap: effectiveCap,
    planType,
    baseCap,
    addonBonus,
    referralBonus,
    remaining: effectiveCap - count,
  };
}

// enforcePlanCapPostInsert(email, insertedJobId): post-insert race guard. Two
// concurrent creates can each pass the pre-check at cap-1 and both insert; we
// re-count and HARD-DELETE the job WE inserted when total exceeds the cap.
export async function enforcePlanCapPostInsert(rawEmail, insertedJobId) {
  const meta = await readEffectiveCap(rawEmail);
  if (meta.effectiveCap == null) return { kept: true, count: null, cap: null };
  const count = await countActiveJobs(meta.email);
  if (count <= meta.effectiveCap) return { kept: true, count, cap: meta.effectiveCap };
  let deleted = null;
  if (insertedJobId) {
    try {
      const res = await JobModel.deleteOne({ _id: insertedJobId });
      if (res?.deletedCount > 0) deleted = String(insertedJobId);
    } catch (e) {
      console.warn(`planCapGuard rollback delete failed for ${insertedJobId}:`, e.message);
    }
  }
  console.warn(JSON.stringify({
    event: "plan.cap.rollback",
    source: "applications-monitor",
    client: meta.email,
    planType: meta.planType,
    cap: meta.effectiveCap,
    actual: count,
    deletedJob: deleted,
  }));
  return { kept: false, count, cap: meta.effectiveCap, deleted };
}

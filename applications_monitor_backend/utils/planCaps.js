export const PLAN_CAPS = {
  ignite: 250,
  professional: 500,
  executive: 1200,
  prime: 160
};

// Minimum jobs in client dashboard before the combined "started" email goes out.
export const MIN_JOBS_FOR_EMAIL = 10;

// Per-plan email schedule. `started` always at MIN_JOBS_FOR_EMAIL once client
// hits Apps-In-Progress + resume done. `completed` at cap. Mid milestones plan-specific.
//
// Key names persist in milestonesNotified, so changing them is a breaking schema change.
export const PLAN_MILESTONES = {
  prime: [
    { key: 'started',   threshold: MIN_JOBS_FOR_EMAIL, type: 'started' },
    { key: 'completed', threshold: 160,                type: 'completed' }
  ],
  ignite: [
    { key: 'started',   threshold: MIN_JOBS_FOR_EMAIL, type: 'started' },
    { key: 'completed', threshold: 250,                type: 'completed' }
  ],
  professional: [
    { key: 'started',   threshold: MIN_JOBS_FOR_EMAIL, type: 'started' },
    { key: 'count_250', threshold: 250,                type: 'count_milestone' },
    { key: 'completed', threshold: 500,                type: 'completed' }
  ],
  executive: [
    { key: 'started',   threshold: MIN_JOBS_FOR_EMAIL, type: 'started' },
    { key: 'count_350', threshold: 350,                type: 'count_milestone' },
    { key: 'count_700', threshold: 700,                type: 'count_milestone' },
    { key: 'completed', threshold: 1200,               type: 'completed' }
  ]
};

export function getPlanMilestones(planType) {
  return PLAN_MILESTONES[String(planType || '').toLowerCase()] || [];
}

export const PLAN_LABELS = {
  ignite: "Ignite",
  professional: "Professional",
  executive: "Executive",
  prime: "Prime"
};

export function getPlanCap(planType) {
  if (!planType) return 0;
  return PLAN_CAPS[String(planType).toLowerCase()] || 0;
}

export function getPlanLabel(planType) {
  if (!planType) return "";
  return PLAN_LABELS[String(planType).toLowerCase()] || planType;
}

// ─── Effective-cap helpers ───
//
// Total applications a client is entitled to = base plan cap + addons + referral
// bonuses. Milestone cron uses this so the "completed" email only fires when the
// FULL effective cap is reached (e.g. Executive 1200 + addon 1000 → completed
// fires at 2200, not 1200).
//
// Addons live on the client doc (`client.addons[].type` or `addonType`, e.g.
// '250'|'500'|'1000'). Referrals live on NewUserModel.referrals[] (each
// `{plan: 'Professional'|'Executive', ...}`). Caller must pass referralAdded
// (resolved separately to avoid coupling planCaps.js to mongoose models).

export function sumAddonApplications(addons) {
  if (!Array.isArray(addons)) return 0;
  return addons.reduce((sum, a) => {
    if (!a) return sum;
    const v = parseInt(a.type ?? a.addonType ?? 0, 10);
    return sum + (Number.isNaN(v) ? 0 : Math.max(0, v));
  }, 0);
}

export function referralApplicationsFor(referrals) {
  if (!Array.isArray(referrals)) return 0;
  let total = 0;
  for (const r of referrals) {
    if (!r) continue;
    if (r.plan === 'Professional') total += 200;
    else if (r.plan === 'Executive') total += 300;
  }
  return total;
}

/**
 * Effective cap = base plan cap + addons + referral bonuses.
 * Pass `referralAdded` resolved from NewUserModel (cron pre-fetches in bulk).
 */
export function getEffectiveCap(client, referralAdded = 0) {
  const base = getPlanCap(client?.planType);
  const addonSum = sumAddonApplications(client?.addons);
  return base + addonSum + Math.max(0, Number(referralAdded) || 0);
}

/**
 * Returns dynamic milestone list for a client. Intermediate `count_*`
 * milestones stay at fixed absolute thresholds (still meaningful for
 * intermediate updates). The `completed` milestone scales to the effective
 * cap (base + addons + referrals) so add-ons can shift when "complete" fires.
 */
export function computeClientMilestones(client, referralAdded = 0) {
  const base = getPlanMilestones(client?.planType);
  if (!base.length) return [];
  const effectiveCap = getEffectiveCap(client, referralAdded);
  return base.map((m) => {
    if (m.type === 'completed') {
      return { ...m, threshold: effectiveCap };
    }
    return { ...m };
  });
}

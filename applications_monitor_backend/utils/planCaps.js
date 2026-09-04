export const PLAN_CAPS = {
  ignite: 250,
  professional: 500,
  executive: 1200,
  prime: 160
};

// List price per plan, in the plan's base currency. This is the number written
// to dashboardtrackings.planPrice, and it is what makes the PLAN badge in
// Client Job Analysis checkable against the payment on the same document.
//
// It used to be declared inline in four places (client create, the plan-upgrade
// endpoint, the Stripe upgrade webhook, and again as caps in the frontend), so
// a price change had to be remembered four times. One copy, here.
export const PLAN_PRICES = {
  ignite: 199,
  professional: 349,
  executive: 599,
  prime: 119
};

// The two collections speak different plan dialects: dashboardtrackings.planType
// is lowercase and has no "Free Trial", while users.planType is capitalised and
// does. Everything that writes a plan goes through here so the two can't drift
// — a drift is not cosmetic, the PLAN badge reads the tracking value while the
// application cap is enforced off the users value.
const PLAN_ALIASES = {
  "free trial": "prime", // legacy label; same 160 cap (see dailyCapGuard.PLAN_CAPS)
  freetrial: "prime",
  free_trial: "prime"
};

/**
 * normalisePlanType(value) → canonical lowercase plan key, or null when the
 * value is empty or not a plan we sell. Never guesses.
 */
export function normalisePlanType(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  const key = PLAN_ALIASES[raw] || raw;
  return Object.prototype.hasOwnProperty.call(PLAN_CAPS, key) ? key : null;
}

export function getPlanPrice(planType) {
  const key = normalisePlanType(planType);
  return key ? PLAN_PRICES[key] : null;
}

/**
 * planWriteFields(value) → the fields every write path must set together, or
 * null for an unrecognised plan.
 *
 *   { planType, planPrice }  → dashboardtrackings (lowercase + matching price)
 *   { planLabel }            → users.planType     (capitalised)
 *
 * Setting planType without planPrice is the bug this exists to prevent: the
 * badge moves to Executive while the payment record still says a Professional
 * price was charged.
 */
export function planWriteFields(value) {
  const planType = normalisePlanType(value);
  if (!planType) return null;
  return { planType, planPrice: PLAN_PRICES[planType], planLabel: PLAN_LABELS[planType] };
}

/**
 * planPaymentMismatch(client) → a short reason string when the plan on the
 * tracking document disagrees with its own payment fields, else null. Read-only
 * — used to flag rows in Client Job Analysis, never to "correct" a document.
 */
export function planPaymentMismatch(client) {
  const planType = normalisePlanType(client?.planType);
  if (!planType) return client?.planType ? `unknown plan "${client.planType}"` : "no plan set";
  const expected = PLAN_PRICES[planType];
  const actual = Number(client?.planPrice);
  if (!Number.isFinite(actual) || actual !== expected) {
    return `plan price ${Number.isFinite(actual) ? actual : "unset"} does not match ${PLAN_LABELS[planType]} (${expected})`;
  }
  // The newest plan_upgrade_to_X payment must name the plan the client is on.
  const ups = Array.isArray(client?.upgradePayments) ? client.upgradePayments : [];
  const lastUpgrade = [...ups].reverse().find((u) => String(u?.for || "").startsWith("plan_upgrade_to_"));
  if (lastUpgrade) {
    const paidFor = normalisePlanType(String(lastUpgrade.for).replace("plan_upgrade_to_", ""));
    if (paidFor && paidFor !== planType) {
      return `last upgrade payment was for ${PLAN_LABELS[paidFor]}, plan says ${PLAN_LABELS[planType]}`;
    }
  }
  return null;
}

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

// Every plan lookup goes through normalisePlanType so PLAN_ALIASES applies
// here too. These used to do a raw lowercase index, which meant a document
// storing the legacy label "Free Trial" silently resolved to no milestones and
// a cap of 0 — the client vanished from the milestone timeline and never got an
// email, with nothing logged. ClientModel's enum normally blocks that value,
// but the update paths run with runValidators:false, so it can still land.
export function getPlanMilestones(planType) {
  const key = normalisePlanType(planType);
  return key ? PLAN_MILESTONES[key] : [];
}

export const PLAN_LABELS = {
  ignite: "Ignite",
  professional: "Professional",
  executive: "Executive",
  prime: "Prime"
};

export function getPlanCap(planType) {
  const key = normalisePlanType(planType);
  return key ? PLAN_CAPS[key] : 0;
}

export function getPlanLabel(planType) {
  const key = normalisePlanType(planType);
  if (key) return PLAN_LABELS[key];
  // Unknown value: echo it back rather than blanking it, so an operator can see
  // what is actually stored on the document instead of an empty badge.
  return planType ? String(planType) : "";
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

/**
 * Keeps planType and planPrice in step on a partial client update.
 *
 * `POST /api/clients` sets whatever the request body carried, straight onto the
 * document. When that body contained planType and nothing else, the plan badge
 * in Client Job Analysis moved but planPrice — the payment record on the same
 * document — did not, so the row then read "Executive" next to a Professional
 * price. Returns the canonical plan key when the update changes the plan, so
 * the caller can mirror it to users.planType (the value the application cap is
 * enforced from); null when the update leaves the plan alone.
 */
export function applyPlanToClientUpdate(clientUpdate) {
  if (!Object.prototype.hasOwnProperty.call(clientUpdate, 'planType')) return null;
  const fields = planWriteFields(clientUpdate.planType);
  if (!fields) {
    // Unknown plan: drop it rather than write a value no consumer can read.
    // ClientModel is updated with runValidators:false, so the enum would not
    // have caught it either.
    console.warn(`[clients] ignoring unknown planType "${clientUpdate.planType}" on update`);
    delete clientUpdate.planType;
    delete clientUpdate.planPrice;
    return null;
  }
  clientUpdate.planType = fields.planType;
  clientUpdate.planPrice = fields.planPrice;
  return fields;
}

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

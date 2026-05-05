export const PLAN_CAPS = {
  ignite: 250,
  professional: 500,
  executive: 1200,
  prime: 160
};

// Minimum jobs in client dashboard before resume_ready / apps_started emails go out.
// Prevents premature notifications when applications have not really started.
export const MIN_JOBS_FOR_EMAIL = 10;

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

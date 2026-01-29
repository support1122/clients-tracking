/**
 * Plan feature flags – same rules across the whole application.
 * - LinkedIn Optimization: PROFESSIONAL and EXECUTIVE only
 * - Cover Letter: EXECUTIVE only
 */

const PLAN_TYPES = ['ignite', 'professional', 'executive', 'prime'];

/**
 * Normalize plan string (e.g. "Professional", "PROFESSIONAL" -> "professional")
 */
export function normalizePlan(planType) {
  if (!planType || typeof planType !== 'string') return null;
  const p = planType.trim().toLowerCase();
  return PLAN_TYPES.includes(p) ? p : null;
}

/**
 * LinkedIn optimization is available only for Professional and Executive plans.
 */
export function hasLinkedInOptimization(planType) {
  const plan = normalizePlan(planType);
  return plan === 'professional' || plan === 'executive';
}

/**
 * Cover letter is available only for Executive plan.
 */
export function hasCoverLetter(planType) {
  const plan = normalizePlan(planType);
  return plan === 'executive';
}

/**
 * Human-readable label for "not in plan" tooltips.
 */
export function planFeatureLabel(feature) {
  if (feature === 'linkedin') {
    return 'LinkedIn Optimization is available for Professional and Executive plans only.';
  }
  if (feature === 'coverLetter') {
    return 'Cover Letter is available for Executive plan only.';
  }
  return '';
}

/**
 * Total number of optimization features included in this plan (resume + linkedin if in plan + coverLetter if in plan).
 */
export function totalOptimizationsInPlan(planType) {
  let n = 1; // resume always
  if (hasLinkedInOptimization(planType)) n += 1;
  if (hasCoverLetter(planType)) n += 1;
  return n;
}

/**
 * Count completed optimizations that are in plan for this planType.
 */
export function completedOptimizationsInPlan(optimizations, planType) {
  if (!optimizations) return 0;
  let count = 0;
  if (optimizations.resumeOptimization?.attachmentUrl) count += 1;
  if (hasLinkedInOptimization(planType) && optimizations.linkedinOptimization?.attachmentUrl) count += 1;
  if (hasCoverLetter(planType) && optimizations.coverLetterOptimization?.attachmentUrl) count += 1;
  return count;
}

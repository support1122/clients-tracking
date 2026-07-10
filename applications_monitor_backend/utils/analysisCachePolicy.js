/**
 * Cache policy for /api/analytics/client-job-analysis.
 *
 * Pulled out of the route so the branch that decides "serve cached vs recompute"
 * can be tested without a Mongo instance. Two rules the route cannot get wrong:
 *
 *   1. The payload carries flaggedByAIToday, a number scoped to one IST calendar
 *      day. pGetAnalysisCache() enforces no maximum age — it returns a day-old
 *      document marked `fresh: false` — and even a *fresh* entry (120s TTL) can
 *      straddle IST midnight. So an entry stamped with a different istDay is
 *      unusable, whatever its freshness says.
 *
 *   2. An explicit operator Refresh must not be answered from the
 *      stale-while-revalidate path, or the button appears to work and changes
 *      nothing. A still-fresh entry is reused, which bounds forced recomputes of
 *      this full-collection scan to at most one per TTL per key.
 */

/** 'YYYY-MM-DD' for the current IST calendar day. */
export function istDayStamp(nowMs = Date.now()) {
  return new Date(nowMs + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * @param {object}  o
 * @param {boolean} o.forceFresh  operator clicked Refresh (body.refresh === true)
 * @param {object|null} o.memHit  L1 in-memory value, or null
 * @param {{val:object, fresh:boolean}|null} o.entry  L2 persistent entry, or null
 * @param {string}  o.istDay      the IST day this request is being answered for
 * @returns {'l1'|'l2-fresh'|'l2-stale'|'compute'}
 */
export function decideAnalysisCacheAction({ forceFresh = false, memHit = null, entry = null, istDay }) {
  const sameDay = (val) => !!val && val.istDay === istDay;

  if (!forceFresh && sameDay(memHit)) return 'l1';

  if (entry && sameDay(entry.val)) {
    if (entry.fresh) return 'l2-fresh';
    if (!forceFresh) return 'l2-stale';
  }

  return 'compute';
}

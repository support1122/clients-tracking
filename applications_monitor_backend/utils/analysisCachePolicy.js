/**
 * Cache policy for /api/analytics/client-job-analysis.
 *
 * Pulled out of the route so the branch that decides "serve cached vs recompute"
 * can be tested without a Mongo instance. Two rules the route cannot get wrong:
 *
 *   1. The payload carries removedByAI, a number scoped to one IST calendar
 *      day. pGetAnalysisCache() enforces no maximum age — it returns a day-old
 *      document marked `fresh: false` — and even a *fresh* entry (120s TTL) can
 *      straddle IST midnight. So an entry stamped with a different istDay is
 *      unusable, whatever its freshness says.
 *
 *   2. An explicit operator Refresh must not be answered from the
 *      stale-while-revalidate path, or the button appears to work and changes
 *      nothing. A still-fresh entry is reused, which bounds forced recomputes of
 *      this full-collection scan to at most one per TTL per key.
 *
 *   3. The payload ALSO carries addedToday, which is scoped to the operator add
 *      window — and that window rolls at 22:00 IST, not midnight (see
 *      utils/addWindow.js). Between 22:00 and midnight IST the two boundaries
 *      disagree: istDay still says "today" while a brand new add window has
 *      already opened. Without a second stamp, the stale-while-revalidate path
 *      would happily serve a pre-22:00 entry showing the *previous* window's
 *      counts, which is precisely the two-hour slot when an operator is checking
 *      whether they hit target. Entries must match on BOTH stamps.
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
 * @param {string}  o.istDay        the IST calendar day this request answers for
 * @param {string} [o.addWindowDay] the 22:00-IST add window this request answers
 *                                  for. Optional so entries written before this
 *                                  field existed are simply treated as stale
 *                                  rather than throwing; they carry no
 *                                  addWindowDay and so can never match.
 * @returns {'l1'|'l2-fresh'|'l2-stale'|'compute'}
 */
export function decideAnalysisCacheAction({
  forceFresh = false,
  memHit = null,
  entry = null,
  istDay,
  addWindowDay = null,
}) {
  // Both stamps must match. istDay alone is wrong between 22:00 and midnight
  // IST, when a new add window has opened but the calendar day has not turned.
  const sameDay = (val) => {
    if (!val || val.istDay !== istDay) return false;
    if (addWindowDay == null) return true;
    return val.addWindowDay === addWindowDay;
  };

  if (!forceFresh && sameDay(memHit)) return 'l1';

  if (entry && sameDay(entry.val)) {
    if (entry.fresh) return 'l2-fresh';
    if (!forceFresh) return 'l2-stale';
  }

  return 'compute';
}

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
 *
 *   4. Neither stamp changes when the CODE changes. Adding a field to the row
 *      shape therefore did nothing for anyone holding a cached entry — the new
 *      field arrived as undefined and stayed that way until midnight or 22:00
 *      IST rolled the stamps over. That produced rows which contradicted
 *      themselves: a client passing the "under target" filter (isUnderTarget
 *      true) while the badge rendered grey (addTargetTracked undefined, so
 *      falsy), when both are derived from the same flag on the server and
 *      cannot legitimately disagree. PAYLOAD_VERSION is the third stamp: bump it
 *      whenever the row or summary shape changes and every stored entry becomes
 *      unservable immediately, on deploy, rather than at the next day boundary.
 */

/**
 * Shape version of the /api/analytics/client-job-analysis payload.
 *
 * BUMP THIS whenever a field is added to, removed from, or given a new meaning
 * in a row or in `summary`. Forgetting to is not a crash — it is worse: stale
 * entries keep being served and the new field silently reads as undefined.
 *
 *   1  jobs-added columns (addedToday, addedYesterday, added7dAvg, dailyTarget,
 *      addShortfall, daysSinceLastAdd), apply recency (appliedToday,
 *      daysSinceLastApply), attention alerts, and addTargetTracked.
 *   2  lastAppliedOperatorName is populated for far more clients: the aggregation
 *      no longer requires appliedDate, which was null on every job an operator
 *      had moved through Saved. Same field, different (correct) values, so the
 *      version has to move or cached rows keep showing a dash.
 *   3  lastAppliedOperatorName now also reports "user" when the CLIENT applied
 *      the last card themselves. Those clients previously rendered a dash,
 *      identical to a client nobody had ever applied for.
 *   4  jobrightCreated added to every row, and removedByAI dropped from the UI.
 *      Without a bump, cached entries would serve jobrightCreated as undefined,
 *      and the UI paints undefined the same as false. Every client would show
 *      the red "not created" J regardless of what the sync actually wrote, until
 *      a day boundary rolled the other stamps over.
 *   5  generatedAt (ISO compute time), cacheAgeMs and servedFrom added to the
 *      response so the UI can show how old the numbers are. Entries written
 *      before this carry no generatedAt, so the max-age check below could not
 *      judge them; the bump makes them unservable instead. Same bump covers
 *      addStatsUnavailable / applyStatsUnavailable on every row, and job-side
 *      counts now folded on trim+lowercase userID (some ghost rows disappear and
 *      some clients' counts change), so older entries must not be served.
 */
export const ANALYSIS_PAYLOAD_VERSION = 5;

/**
 * Hard ceiling on how old an entry may be and still be served by the
 * stale-while-revalidate path ('l2-stale').
 *
 * Before this existed, any entry from the same IST day / add window / payload
 * version was served stale however old it was: pGetAnalysisCache() enforces no
 * maximum age, so a page load could be answered with a payload hours old, and
 * the background recompute only helped whoever reloaded a second time. Past
 * this age the request recomputes and the user waits for live data instead.
 *
 * 60s: twice the 30s ANALYSIS_CACHE_TTL, so the stale window is the 30s after
 * expiry (the case SWR is meant for: instant answer while one background
 * compute runs), and nothing older than a minute is ever shown as current.
 * Measured by generatedAt, not by the cache's own exp, so it holds across
 * instances and for entries whose exp was extended.
 */
export const MAX_STALE_MS = 60_000;

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
 * @param {number} [o.now]         epoch ms used for the max-age check (tests inject it)
 * @param {number} [o.maxStaleMs]   override for MAX_STALE_MS
 * @param {number} [o.payloadVersion] shape version the caller expects. Optional
 *                                  for the same reason; when given, an entry
 *                                  built by older code can never match.
 * @returns {'l1'|'l2-fresh'|'l2-stale'|'compute'}
 */
export function decideAnalysisCacheAction({
  forceFresh = false,
  memHit = null,
  entry = null,
  istDay,
  addWindowDay = null,
  payloadVersion = null,
  now = Date.now(),
  maxStaleMs = MAX_STALE_MS,
}) {
  // All three stamps must match. istDay alone is wrong between 22:00 and
  // midnight IST, when a new add window has opened but the calendar day has not
  // turned; and neither day stamp moves when the payload SHAPE changes.
  const sameDay = (val) => {
    if (!val || val.istDay !== istDay) return false;
    if (addWindowDay != null && val.addWindowDay !== addWindowDay) return false;
    if (payloadVersion != null && val.payloadVersion !== payloadVersion) return false;
    return true;
  };

  if (!forceFresh && sameDay(memHit)) return 'l1';

  if (entry && sameDay(entry.val)) {
    if (entry.fresh) return 'l2-fresh';
    // Stale is only servable while young. An entry with no parseable
    // generatedAt cannot be aged, so it is not trusted either.
    const generatedMs = Date.parse(entry.val.generatedAt);
    if (!forceFresh && Number.isFinite(generatedMs) && now - generatedMs <= maxStaleMs) {
      return 'l2-stale';
    }
  }

  return 'compute';
}

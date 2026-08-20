/**
 * Per-client "jobs applied" recency, for the alert that catches a client whose
 * saved column is filling up while nobody applies from it.
 *
 * WHY A DIFFERENT DAY BOUNDARY THAN clientAddStats
 * ------------------------------------------------
 * Adds are bucketed on the 22:00 IST push-cap window, because that is the
 * window the cap enforces and the extension displays. Applies are NOT. An
 * apply is stamped into `appliedDate` as an IST wall-clock string by
 * UpdateChanges.getCurrentISTTime() — `new Date().toLocaleString('en-IN')`,
 * which yields "20/8/2026, 3:45:12 pm". There is no window in that data, only a
 * calendar day, so bucketing it on a 22:00 boundary would mean guessing. The
 * honest unit is the IST calendar day and that is what this uses.
 *
 * The string is day-first. This is verified, not assumed: the client-job-analysis
 * route records that 2996 rows in the collection are unambiguously day-first
 * (first component > 12) and zero are month-first. new Date() must never be used
 * on it — that reads "1/8/2026" as 8 January instead of 1 August.
 *
 * Matching is done with ANCHORED regexes so Mongo can use the { appliedDate: 1 }
 * index (see utils/ensureDbIndexes.js) rather than scanning. The day index is
 * then resolved with a $switch that runs only over the already-narrowed
 * lookback slice, never over the whole collection — an unanchored $switch across
 * every document was previously the single biggest cost of this endpoint.
 */

/** How far back to look for the most recent apply. Beyond this reads as "stale". */
export const APPLY_LOOKBACK_DAYS = 14;

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Day-first D/M/YYYY regex sources for the last `days` IST calendar days.
 * Index 0 is today, 1 is yesterday, and so on — so the index IS the age in days.
 *
 * Both zero-padded and unpadded forms are accepted because the collection holds
 * both ("08/09/2026" and "8/9/2026"), and the trailing lookahead stops
 * "1/8/2026" from also matching "11/8/2026".
 *
 * @param {number} days
 * @param {number} nowMs
 * @returns {{ ymd: string, source: string }[]}
 */
export function istDayPatterns(days = APPLY_LOOKBACK_DAYS, nowMs = Date.now()) {
  const out = [];
  for (let i = 0; i < days; i += 1) {
    const ist = new Date(nowMs + IST_OFFSET_MS - i * MS_PER_DAY);
    const d = ist.getUTCDate();
    const m = ist.getUTCMonth() + 1;
    const y = ist.getUTCFullYear();
    out.push({
      ymd: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      source: `^${d < 10 ? `0?${d}` : d}/${m < 10 ? `0?${m}` : m}/${y}(?=$|\\D)`,
    });
  }
  return out;
}

/**
 * @typedef {object} ClientApplyStat
 * @property {number}      appliedToday        applies stamped with today's IST date
 * @property {number}      appliedLookback     applies within the lookback window
 * @property {number|null} daysSinceLastApply  0 = today, null = none in the window
 * @property {string|null} lastAppliedYmd      IST day of the most recent apply
 * @property {boolean}     beyondLookback      true when nothing was found in the window
 */

/**
 * @param {object} o
 * @param {import('mongoose').Model} o.JobModel
 * @param {number} [o.nowMs]
 * @param {string[]|null} [o.emails]  restrict to these clients; omit for all
 * @param {number} [o.lookbackDays]
 * @returns {Promise<Map<string, ClientApplyStat>>} keyed by lowercased client email
 */
export async function computeClientApplyStats({
  JobModel,
  nowMs = Date.now(),
  emails = null,
  lookbackDays = APPLY_LOOKBACK_DAYS,
} = {}) {
  const patterns = istDayPatterns(lookbackDays, nowMs);

  const userLower = { $toLower: { $trim: { input: { $ifNull: ['$userID', ''] } } } };
  const emailList = Array.isArray(emails) && emails.length
    ? emails.map((e) => String(e || '').toLowerCase())
    : null;

  const rows = await JobModel.aggregate([
    {
      $match: {
        appliedDate: { $nin: [null, '', ' '] },
        // Anchored alternatives, one per day. Each branch is index-eligible on
        // { appliedDate: 1 }, which is what keeps this off a collection scan.
        $or: patterns.map((p) => ({ appliedDate: { $regex: p.source } })),
      },
    },
    { $addFields: { _userLower: userLower } },
    ...(emailList ? [{ $match: { _userLower: { $in: emailList } } }] : []),
    {
      $addFields: {
        // Age in days. The $switch only runs over documents that already passed
        // the lookback match, so this is a small set by construction.
        _dayIdx: {
          $switch: {
            branches: patterns.map((p, i) => ({
              case: { $regexMatch: { input: '$appliedDate', regex: p.source } },
              then: i,
            })),
            default: null,
          },
        },
      },
    },
    { $match: { _dayIdx: { $ne: null } } },
    {
      $group: {
        _id: '$_userLower',
        appliedToday: { $sum: { $cond: [{ $eq: ['$_dayIdx', 0] }, 1, 0] } },
        appliedLookback: { $sum: 1 },
        // Smallest age = most recent apply.
        minDayIdx: { $min: '$_dayIdx' },
      },
    },
  ], { allowDiskUse: true });

  const out = new Map();
  for (const r of rows || []) {
    const email = String(r?._id || '').trim().toLowerCase();
    if (!email) continue;
    const idx = Number.isInteger(r.minDayIdx) ? r.minDayIdx : null;
    out.set(email, {
      appliedToday: r.appliedToday || 0,
      appliedLookback: r.appliedLookback || 0,
      daysSinceLastApply: idx,
      lastAppliedYmd: idx == null ? null : patterns[idx]?.ymd ?? null,
      beyondLookback: idx == null,
    });
  }
  return out;
}

/**
 * Zeroed stat for a client with no applies inside the lookback window. Note the
 * distinction this preserves: daysSinceLastApply is null and beyondLookback is
 * true, which means "not in the last 14 days" — NOT "never applied". The UI must
 * render that as "14+" rather than inventing a number.
 */
export function emptyApplyStat() {
  return {
    appliedToday: 0,
    appliedLookback: 0,
    daysSinceLastApply: null,
    lastAppliedYmd: null,
    beyondLookback: true,
  };
}

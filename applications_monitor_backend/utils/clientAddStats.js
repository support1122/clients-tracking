/**
 * Per-client "jobs added" statistics, keyed on the 22:00 IST add window.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every guard we had was a ceiling. dailyCapGuard blocks job #31; nothing
 * anywhere noticed job #3. Worse, the two daily Discord reminders both measure
 * the SAVED BACKLOG rather than what was added:
 *
 *   • runJobCardReminder fires when saved > 0 and says "please apply", so an
 *     operator who adds fewer cards gets nagged less.
 *   • runZeroSavedJobReminder fires only when saved is exactly 0 LIFETIME, so a
 *     single stale card from three weeks ago suppresses it forever.
 *
 * Adding less therefore made Discord quieter, not louder. This module supplies
 * the missing number — jobs actually added in the current window, against the
 * target the cap already enforces — so the reminders and the Client Job
 * Analysis screen can be repointed at it.
 *
 * One implementation, used by both the analytics route and the shortfall cron,
 * so a client can never be "under target" on one surface and fine on the other.
 */

import {
  addWindowStart,
  addWindowStartNBack,
  objectIdAt,
  windowsSince,
  effectiveDailyTarget,
} from './addWindow.js';

/** Windows of history used for the rolling average. Excludes the live one. */
export const LOOKBACK_WINDOWS = 7;

/**
 * @typedef {object} ClientAddStat
 * @property {number}      addedToday        ops-added jobs in the open window
 * @property {number}      addedYesterday    ops-added jobs in the previous window
 * @property {number}      addedPrev7Total   ops-added jobs across the 7 closed windows
 * @property {number}      added7dAvg        addedPrev7Total / 7, to 1dp
 * @property {Date|null}   lastAddedAt       when ops last added anything, ever
 * @property {number|null} daysSinceLastAdd  whole windows since; 0 = today, null = never
 * @property {number}      dailyTarget       effective target (targetJobCount, else 30)
 * @property {boolean}     isDefaultTarget   true when no explicit targetJobCount is set
 * @property {number}      addShortfall      max(0, dailyTarget - addedToday)
 * @property {number}      addFulfillmentPct addedToday / dailyTarget, as a whole percent
 * @property {boolean}     isUnderTarget     addedToday < dailyTarget
 * @property {string[]}    todayOperators    operator names who added in the open window
 */

/**
 * Build the per-client add statistics map.
 *
 * Models are injected rather than imported so this stays free of the circular
 * dependency on index.js, which is where getProfileModel() lives.
 *
 * @param {object} o
 * @param {import('mongoose').Model} o.JobModel
 * @param {import('mongoose').Model} o.ProfileModel  the shared `profiles` collection
 * @param {number} [o.nowMs]
 * @param {string[]} [o.emails]  restrict to these clients; omit for all
 * @returns {Promise<Map<string, ClientAddStat>>} keyed by lowercased client email
 */
export async function computeClientAddStats({ JobModel, ProfileModel, nowMs = Date.now(), emails = null }) {
  const windowStart = addWindowStart(nowMs);
  const yesterdayStart = addWindowStartNBack(1, nowMs);
  const lookbackStart = addWindowStartNBack(LOOKBACK_WINDOWS, nowMs);

  const oidToday = objectIdAt(windowStart);
  const oidYesterday = objectIdAt(yesterdayStart);
  const oidLookback = objectIdAt(lookbackStart);

  // Lowercase + trim the client email the same way the reminder crons do, so a
  // case-mismatched legacy userID cannot split one client across two rows.
  const userLower = { $toLower: { $trim: { input: { $ifNull: ['$userID', ''] } } } };
  const emailFilter = Array.isArray(emails) && emails.length
    ? [{ $match: { _userLower: { $in: emails.map((e) => String(e || '').toLowerCase()) } } }]
    : [];

  const [windowed, lastAdds, profiles] = await Promise.all([
    // Windowed counts. The _id range bound is the whole point: Mongo seeks to
    // the first ObjectId of the lookback window instead of scanning lifetime
    // history, which is what makes this cheap enough to run on every request.
    JobModel.aggregate([
      { $match: { createdByRole: 'operations', _id: { $gte: oidLookback } } },
      { $addFields: { _userLower: userLower } },
      ...emailFilter,
      {
        $group: {
          _id: '$_userLower',
          addedToday: { $sum: { $cond: [{ $gte: ['$_id', oidToday] }, 1, 0] } },
          addedYesterday: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ['$_id', oidYesterday] }, { $lt: ['$_id', oidToday] }] },
                1,
                0,
              ],
            },
          },
          // Closed windows only. Today is deliberately excluded — a window that
          // is two hours old would drag the average down and make every client
          // look like they are falling behind every morning.
          addedPrev7Total: { $sum: { $cond: [{ $lt: ['$_id', oidToday] }, 1, 0] } },
          todayOperators: {
            $addToSet: {
              $cond: [{ $gte: ['$_id', oidToday] }, { $ifNull: ['$operatorName', null] }, null],
            },
          },
        },
      },
    ], { allowDiskUse: true }),

    // Last add ever, for the "gone quiet" flag. Unbounded by design: a client
    // who has had nothing added for a week is exactly the one worth surfacing,
    // and a lookback-bounded query would report them identically to a client
    // who was added to yesterday.
    JobModel.aggregate([
      { $match: { createdByRole: 'operations' } },
      { $addFields: { _userLower: userLower } },
      ...emailFilter,
      { $group: { _id: '$_userLower', lastAddId: { $max: '$_id' } } },
    ], { allowDiskUse: true }),

    ProfileModel.find(
      Array.isArray(emails) && emails.length
        ? { email: { $in: emails.map((e) => String(e || '').toLowerCase()) } }
        : {},
      { email: 1, targetJobCount: 1 }
    ).lean(),
  ]);

  const targetByEmail = new Map();
  for (const p of profiles || []) {
    const key = String(p?.email || '').trim().toLowerCase();
    if (key) targetByEmail.set(key, p?.targetJobCount);
  }

  const lastAddByEmail = new Map();
  for (const r of lastAdds || []) {
    const key = String(r?._id || '').trim().toLowerCase();
    if (key && r?.lastAddId?.getTimestamp) lastAddByEmail.set(key, r.lastAddId.getTimestamp());
  }

  const out = new Map();

  // Seed from every client we have EITHER a windowed count or a lifetime add
  // for. A client with no windowed row added nothing in seven days, which is
  // the loudest signal there is, so they must not be dropped for having no row.
  const allKeys = new Set([
    ...(windowed || []).map((r) => String(r?._id || '').trim().toLowerCase()),
    ...lastAddByEmail.keys(),
    ...targetByEmail.keys(),
  ]);
  allKeys.delete('');

  const windowedByEmail = new Map(
    (windowed || []).map((r) => [String(r?._id || '').trim().toLowerCase(), r])
  );

  for (const email of allKeys) {
    const w = windowedByEmail.get(email);
    const addedToday = w?.addedToday || 0;
    const addedYesterday = w?.addedYesterday || 0;
    const addedPrev7Total = w?.addedPrev7Total || 0;
    const { target, isDefault } = effectiveDailyTarget(targetByEmail.get(email));
    const lastAddedAt = lastAddByEmail.get(email) || null;

    out.set(email, {
      addedToday,
      addedYesterday,
      addedPrev7Total,
      added7dAvg: Math.round((addedPrev7Total / LOOKBACK_WINDOWS) * 10) / 10,
      lastAddedAt,
      daysSinceLastAdd: windowsSince(lastAddedAt, nowMs),
      dailyTarget: target,
      isDefaultTarget: isDefault,
      addShortfall: Math.max(0, target - addedToday),
      addFulfillmentPct: target > 0 ? Math.round((addedToday / target) * 100) : 0,
      isUnderTarget: addedToday < target,
      todayOperators: (w?.todayOperators || []).filter((n) => typeof n === 'string' && n.trim() !== ''),
    });
  }

  return out;
}

/** Zero-value stat for a client with no row at all, so callers never see undefined. */
export function emptyAddStat(rawTargetJobCount = null) {
  const { target, isDefault } = effectiveDailyTarget(rawTargetJobCount);
  return {
    addedToday: 0,
    addedYesterday: 0,
    addedPrev7Total: 0,
    added7dAvg: 0,
    lastAddedAt: null,
    daysSinceLastAdd: null,
    dailyTarget: target,
    isDefaultTarget: isDefault,
    addShortfall: target,
    addFulfillmentPct: 0,
    isUnderTarget: true,
    todayOperators: [],
  };
}

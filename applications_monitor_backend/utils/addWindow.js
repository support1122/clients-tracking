/**
 * Add-window helpers: what "jobs added today" means for an operator.
 *
 * The operator day does NOT start at midnight. It starts at 22:00 IST, because
 * that is when the per-client daily push cap resets — see
 * flashfire-dashboard-backend-main/Utils/dailyCapGuard.js, CAP_RESET_HOUR_IST.
 * Both repos share one database and one jobdbs collection, so a shortfall
 * report built on a midnight boundary would disagree with the cap counter the
 * extension shows the same operator on the same screen. The first thing anyone
 * does with two numbers that disagree is stop trusting both, so the boundary
 * here is copied from the cap guard rather than reinvented.
 *
 * Everything is keyed on ObjectId timestamps, never on the dateAdded string.
 * dateAdded is written in mixed orientations across the collection (6564
 * day-first rows against 1688 month-first — see the note in the
 * client-job-analysis route), so it cannot be bucketed into days at all.
 * ObjectIds are monotonic in creation time and always can.
 */

import mongoose from 'mongoose';

/** The push cap resets at 22:00 Asia/Kolkata. Mirrors dailyCapGuard. */
export const CAP_RESET_HOUR_IST = 22;

/** IST is UTC+5:30 year-round. No DST, so a fixed offset is exact. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * UTC instant at which the CURRENT add window opened, i.e. the most recent
 * 22:00 IST boundary at or before `nowMs`.
 *
 * Identical logic to dailyCapGuard.startOfTodayIST(), with `nowMs` injectable
 * so this is testable without freezing the clock.
 *
 * @param {number} nowMs
 * @returns {Date}
 */
export function addWindowStart(nowMs = Date.now()) {
  const istNow = new Date(nowMs + IST_OFFSET_MS);
  const boundary = new Date(istNow.getTime());
  boundary.setUTCHours(CAP_RESET_HOUR_IST, 0, 0, 0);
  // Before today's 22:00 IST → the active window opened at 22:00 IST yesterday.
  if (istNow.getTime() < boundary.getTime()) {
    boundary.setTime(boundary.getTime() - MS_PER_DAY);
  }
  return new Date(boundary.getTime() - IST_OFFSET_MS);
}

/**
 * Start of the window `n` days back. n=0 is the current window, n=1 is
 * yesterday's, and so on.
 *
 * @param {number} n
 * @param {number} nowMs
 * @returns {Date}
 */
export function addWindowStartNBack(n, nowMs = Date.now()) {
  const base = addWindowStart(nowMs);
  return new Date(base.getTime() - Math.max(0, Math.trunc(n)) * MS_PER_DAY);
}

/**
 * Lowest possible ObjectId for a given instant. Used as a `_id: { $gte: … }`
 * range bound so Mongo can seek instead of scanning.
 *
 * @param {Date} date
 * @returns {mongoose.Types.ObjectId}
 */
export function objectIdAt(date) {
  const seconds = Math.floor(date.getTime() / 1000);
  return new mongoose.Types.ObjectId(seconds.toString(16).padStart(8, '0') + '0000000000000000');
}

/**
 * 'YYYY-MM-DD' label for the window that is open at `nowMs`.
 *
 * The window opening at 22:00 IST on the 19th is the 20th's working day — ops
 * work it through the 20th's daytime — so the label is taken two hours after
 * the boundary, which lands inside the labelled calendar day by construction.
 *
 * @param {number} nowMs
 * @returns {string}
 */
export function addWindowDayStamp(nowMs = Date.now()) {
  const start = addWindowStart(nowMs).getTime();
  return new Date(start + 2 * 60 * 60 * 1000 + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Whole add-windows elapsed since a job was last added.
 *
 * 0 means "added inside the window that is open right now". 1 means the last
 * add was in yesterday's window, which is exactly the "nothing added for a day"
 * condition. Returns null when the client has never had a job added, because
 * that is a different problem from having gone quiet and the UI must not render
 * it as a very large number of days.
 *
 * @param {Date|null} lastAddedAt
 * @param {number} nowMs
 * @returns {number|null}
 */
export function windowsSince(lastAddedAt, nowMs = Date.now()) {
  if (!lastAddedAt) return null;
  const currentStart = addWindowStart(nowMs).getTime();
  const at = lastAddedAt.getTime();
  if (at >= currentStart) return 0;
  return Math.floor((currentStart - at) / MS_PER_DAY) + 1;
}

/**
 * Effective daily target for a client. Mirrors dailyCapGuard.readCap(): an
 * explicit positive targetJobCount wins, anything else (unset, zero, negative,
 * NaN) falls back to the default rather than disabling the target — a typo'd 0
 * must not read as "this client needs no jobs".
 *
 * @param {unknown} rawTargetJobCount
 * @returns {{ target: number, isDefault: boolean }}
 */
export const DEFAULT_DAILY_TARGET = 30;

export function effectiveDailyTarget(rawTargetJobCount) {
  const raw = Number(rawTargetJobCount);
  const explicit = Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : null;
  return {
    target: explicit ?? DEFAULT_DAILY_TARGET,
    isDefault: explicit == null,
  };
}

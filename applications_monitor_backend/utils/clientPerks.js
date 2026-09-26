import mongoose from 'mongoose';
import { istDayPatterns } from './clientApplyStats.js';

/**
 * Permanently switches off the Upgrade and Refer n Earn buttons for clients who
 * have gone dormant.
 *
 * WHY
 * ---
 * Both buttons cost the business money. Upgrade sends a client to a payment
 * page we then have to service, and Refer n Earn grants free applications to
 * whoever the client brings in (see the dashboard backend's
 * Utils/referralCredit.js). A client whose account was closed months ago and who
 * nobody has worked on for a fortnight should not be able to trigger either.
 *
 * THE RULE, AND WHY IT IS STICKY
 * ------------------------------
 * A client is flagged when BOTH hold:
 *
 *   1. their tracking status is "inactive"; and
 *   2. nothing has happened on their account for PERKS_DORMANT_DAYS days -
 *      no job card applied for them AND none added for them.
 *
 * Once flagged, the flag is never cleared automatically. That is deliberate and
 * it is what "disabled for ever" means: reviving the client, or an operator
 * adding a single job card, does NOT hand the perks back. Only a human clearing
 * perksDisabledAt does. A live recomputation was the alternative and was
 * rejected, because the buttons would flicker back the moment anyone touched the
 * account.
 *
 * ACTIVITY IS ADDS *OR* APPLIES
 * -----------------------------
 * The looser of the two definitions on purpose. A client whose operator is still
 * adding cards is being worked on, whatever the status field says, and locking
 * them out permanently on the strength of a stale status flag is not a mistake
 * this code gets to make twice.
 *
 * Adds are measured by ObjectId creation time, not by `dateAdded`. dateAdded is
 * a locale string written in mixed day-first and month-first orientations (6564
 * rows vs 1688 at last count), so it cannot be compared as a date. The ObjectId
 * timestamp is the only creation stamp on a job that is reliable.
 *
 * Applies are measured off `appliedDate`, a day-first IST wall-clock string,
 * with the same anchored per-day regexes clientApplyStats uses so the query
 * stays on the { appliedDate: 1 } index instead of scanning.
 */

/** Days of silence, on an inactive account, before the perks are withdrawn. */
export const PERKS_DORMANT_DAYS = 14;

/** Reason string stamped alongside the flag, so the DB explains itself. */
export const PERKS_REASON_DORMANT = 'inactive_no_activity_14d';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const normEmail = (v) => String(v || '').trim().toLowerCase();

/**
 * Is this tracking record's status the closed one?
 *
 * Compared case-insensitively against the trimmed value rather than with ===,
 * because the field is free-form in practice even though the schema declares an
 * enum: documents written before the enum landed are not revalidated on read.
 */
export function isInactiveStatus(status) {
     return String(status || '').trim().toLowerCase() === 'inactive';
}

/**
 * Should the flag be written for this client, right now?
 *
 * Pure. No database, no clock. The sweep below supplies the facts and this
 * decides, so the rule can be tested without a Mongo instance and so nothing
 * else can quietly disagree about what "dormant" means.
 *
 * @param {object} o
 * @param {string} o.status              tracking status, "active" or "inactive"
 * @param {boolean} o.activeInLookback   a card was added OR applied in the window
 * @param {Date|string|null} [o.perksDisabledAt]  already flagged, if set
 * @returns {boolean}
 */
export function shouldDisablePerks({ status, activeInLookback, perksDisabledAt = null }) {
     // Already flagged. The flag is write-once, so there is nothing to do and
     // nothing to re-stamp; re-stamping would destroy the date it happened.
     if (perksDisabledAt) return false;
     if (!isInactiveStatus(status)) return false;
     return !activeInLookback;
}

/**
 * The flag as the rest of the system reads it.
 *
 * A single accessor so no caller has to remember that the stored value is a
 * DATE and that its mere presence is what disables the buttons.
 *
 * @param {object|null} trackingDoc  a dashboardtrackings document
 * @returns {boolean}
 */
export function perksDisabled(trackingDoc) {
     return Boolean(trackingDoc?.perksDisabledAt);
}

/**
 * Lowercased emails, among `emails`, that have had ANY job activity inside the
 * lookback window.
 *
 * Two queries rather than one. Adds and applies are stored in completely
 * different shapes - an ObjectId versus a day-first locale string - and there is
 * no single indexed predicate that covers both. Running them separately keeps
 * each one on its own index.
 *
 * @param {object} o
 * @param {import('mongoose').Model} o.JobModel
 * @param {string[]} o.emails
 * @param {number} [o.nowMs]
 * @param {number} [o.lookbackDays]
 * @returns {Promise<Set<string>>}
 */
export async function findClientsActiveInWindow({
     JobModel,
     emails,
     nowMs = Date.now(),
     lookbackDays = PERKS_DORMANT_DAYS,
}) {
     const list = [...new Set((Array.isArray(emails) ? emails : []).map(normEmail).filter(Boolean))];
     const active = new Set();
     if (list.length === 0) return active;

     // userID carries the client's email but its case is not normalised in the
     // collection, so it has to be lowered before it can be compared.
     const userLower = { $toLower: { $trim: { input: { $ifNull: ['$userID', ''] } } } };

     // ── Added in the window ──────────────────────────────────────────────
     // ObjectId time, for the reason in the header comment. Seconds resolution
     // is plenty when the window is 14 days wide.
     const cutoffSec = Math.floor((nowMs - lookbackDays * MS_PER_DAY) / 1000);
     const cutoffId = mongoose.Types.ObjectId.createFromTime(cutoffSec);

     const added = await JobModel.aggregate([
          { $match: { _id: { $gte: cutoffId } } },
          { $addFields: { _userLower: userLower } },
          { $match: { _userLower: { $in: list } } },
          { $group: { _id: '$_userLower' } },
     ], { allowDiskUse: true });

     for (const r of added || []) {
          const e = normEmail(r?._id);
          if (e) active.add(e);
     }

     // ── Applied in the window ────────────────────────────────────────────
     const patterns = istDayPatterns(lookbackDays, nowMs);
     const applied = await JobModel.aggregate([
          {
               $match: {
                    appliedDate: { $nin: [null, '', ' '] },
                    $or: patterns.map((p) => ({ appliedDate: { $regex: p.source } })),
               },
          },
          { $addFields: { _userLower: userLower } },
          { $match: { _userLower: { $in: list } } },
          { $group: { _id: '$_userLower' } },
     ], { allowDiskUse: true });

     for (const r of applied || []) {
          const e = normEmail(r?._id);
          if (e) active.add(e);
     }

     return active;
}

/**
 * Find dormant clients and stamp the flag on them.
 *
 * Only ever ADDS the flag. There is no code path here or anywhere else that
 * clears it, which is the whole point.
 *
 * Call with `apply: false` to see what it would do without writing anything.
 * Worth doing on the first run against production.
 *
 * @param {object} o
 * @param {import('mongoose').Model} o.ClientModel  dashboardtrackings
 * @param {import('mongoose').Model} o.JobModel
 * @param {number} [o.nowMs]
 * @param {number} [o.lookbackDays]
 * @param {boolean} [o.apply]  false for a dry run
 * @returns {Promise<{scanned: number, flagged: string[], skippedActive: string[], applied: boolean}>}
 */
export async function sweepDormantClientPerks({
     ClientModel,
     JobModel,
     nowMs = Date.now(),
     lookbackDays = PERKS_DORMANT_DAYS,
     apply = true,
} = {}) {
     const out = { scanned: 0, flagged: [], skippedActive: [], applied: apply };

     // Candidates: inactive and not already flagged. `perksDisabledAt: null`
     // matches documents where the field is missing as well as those where it is
     // explicitly null, which is what every pre-existing row looks like.
     const candidates = await ClientModel.find(
          { status: /^inactive$/i, perksDisabledAt: null },
          { email: 1, status: 1, perksDisabledAt: 1 },
     ).lean();

     out.scanned = candidates.length;
     if (candidates.length === 0) return out;

     const emails = candidates.map((c) => normEmail(c?.email)).filter((e) => e.includes('@'));
     const activeEmails = await findClientsActiveInWindow({ JobModel, emails, nowMs, lookbackDays });

     const toFlag = [];
     for (const c of candidates) {
          const email = normEmail(c?.email);
          if (!email) continue;
          const activeInLookback = activeEmails.has(email);
          if (shouldDisablePerks({ status: c.status, activeInLookback, perksDisabledAt: c.perksDisabledAt })) {
               toFlag.push(email);
          } else if (activeInLookback) {
               out.skippedActive.push(email);
          }
     }

     out.flagged = toFlag;
     if (!apply || toFlag.length === 0) return out;

     await ClientModel.updateMany(
          { email: { $in: toFlag }, perksDisabledAt: null },
          { $set: { perksDisabledAt: new Date(nowMs), perksDisabledReason: PERKS_REASON_DORMANT } },
     );

     console.log(
          `[clientPerks] withdrew Upgrade and Refer n Earn from ${toFlag.length} dormant client(s) ` +
          `(inactive with no adds or applies in ${lookbackDays} days); ` +
          `${out.skippedActive.length} inactive client(s) left alone because they still had activity`,
     );

     return out;
}

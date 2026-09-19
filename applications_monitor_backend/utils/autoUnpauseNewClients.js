/**
 * Auto-unpause: a client sitting in "New" who has real job cards is not new.
 *
 * "New" (ClientModel.onboardingPhase) means onboarding has not started, and it
 * implies isPaused so the client is excluded from the daily add target, the
 * shortfall report and the Discord reminders. Once operators are actually
 * adding cards for them, leaving the flag set hides live work from every one of
 * those surfaces. This flips them to Unpaused on their own.
 *
 * SCOPE, deliberately narrow
 * --------------------------
 * Only onboardingPhase clients are touched. A client an operator explicitly
 * Paused (isPaused true, onboardingPhase false) is left alone: that pause was a
 * decision, often non-payment or a client request, and undoing it automatically
 * would silently restart work on someone who was stopped for a reason.
 *
 * TWO ENTRY POINTS, one rule
 * --------------------------
 *   autoUnpauseIfEligible()  runs right after a job card is created here, so
 *                            the common case is instant.
 *   runAutoUnpauseSweep()    catches cards written by the dashboard backend
 *                            straight into the same collection, which never
 *                            passes through this service's create route.
 *
 * Both write the same three fields through the same helper, so the two paths
 * cannot drift.
 */

import { JobModel } from '../JobModel.js';
import { ClientModel } from '../ClientModel.js';
import { countActiveJobs, ACTIVE_JOB_STATUS_OR } from './planCapGuard.js';
import { clearAnalysisCache } from './analysisCache.js';
import { pClearAnalysisCache } from './persistentAnalysisCache.js';
import { addClientActionToJobMoveHistory } from '../controllers/onboardingController.js';

/**
 * How many live job cards a New client needs before they stop being new.
 * Two, not one: a single card can be a mistake or a test, and flipping a
 * client's phase is visible to the whole team.
 */
export const AUTO_UNPAUSE_MIN_JOB_CARDS = 2;

/** Exactly what "Unpaused" means on the Client Job Analysis phase control. */
const UNPAUSE_FIELDS = Object.freeze({
  onboardingPhase: false,
  isPaused: false,
  // Mirrors mergePausedAtIntoClientUpdate: a client who is not effectively
  // paused carries no pausedAt, or the screen would print a paused duration
  // next to an unpaused client.
  pausedAt: null,
});

const istNow = () => new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });

/**
 * Flip one client, guarding against a concurrent flip.
 *
 * The filter repeats `onboardingPhase: true`, so this is a compare-and-set: if
 * two job cards land at once, or the sweep races the create hook, exactly one
 * call reports a change and only one audit line is written.
 *
 * @returns {Promise<boolean>} whether THIS call was the one that changed it
 */
async function applyUnpause(email, count, trigger) {
  const result = await ClientModel.updateOne(
    { email, onboardingPhase: true },
    { $set: { ...UNPAUSE_FIELDS, updatedAt: istNow() } },
  );
  if (!(result?.modifiedCount > 0)) return false;

  console.log(`[auto-unpause] ${email} New → Unpaused (${count} job cards, trigger=${trigger})`);

  // Best effort. The phase change is the product behaviour and must not fail
  // because a client has no onboarding ticket to append history to.
  try {
    await addClientActionToJobMoveHistory(email, 'auto_unpaused_job_cards', {
      email: 'system',
      name: 'Auto-unpause',
      meta: { jobCards: count, threshold: AUTO_UNPAUSE_MIN_JOB_CARDS, trigger },
    });
  } catch (e) {
    console.warn(`[auto-unpause] move history append failed for ${email}:`, e?.message || e);
  }
  return true;
}

/**
 * Client Job Analysis serves isPaused/onboardingPhase from a cache keyed on the
 * IST day, the add window and the payload version. None of those move when a
 * phase flips, so without this the screen keeps showing New until a day
 * boundary rolls the stamps over.
 */
function invalidateAnalysisCaches() {
  clearAnalysisCache();
  pClearAnalysisCache().catch(() => {});
}

/**
 * Single-client check, cheap enough to call on every job-card creation.
 *
 * Ordered so the overwhelmingly common case (client is not New) costs one
 * indexed lookup on an already-projected field and nothing else. The job count,
 * which is the expensive half, only runs for clients still in New.
 *
 * @returns {Promise<{changed: boolean, reason: string, count?: number}>}
 */
export async function autoUnpauseIfEligible(rawEmail, { trigger = 'job-created' } = {}) {
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return { changed: false, reason: 'bad_email' };

  const client = await ClientModel.findOne({ email }).select('onboardingPhase').lean();
  if (!client) return { changed: false, reason: 'no_client' };
  if (client.onboardingPhase !== true) return { changed: false, reason: 'not_new' };

  const count = await countActiveJobs(email);
  if (count < AUTO_UNPAUSE_MIN_JOB_CARDS) return { changed: false, reason: 'below_threshold', count };

  const changed = await applyUnpause(email, count, trigger);
  if (changed) invalidateAnalysisCaches();
  return { changed, reason: changed ? 'unpaused' : 'already_changed', count };
}

/**
 * Sweep every New client at once.
 *
 * One aggregation rather than a countDocuments per client: with the whole New
 * bucket as candidates, per-client counting would be one round trip each on
 * every tick, for a result that is almost always "nothing to do".
 */
export async function runAutoUnpauseSweep({ trigger = 'cron' } = {}) {
  const started = Date.now();
  const candidates = await ClientModel.find({ onboardingPhase: true })
    .select('email')
    .lean();

  const emails = candidates
    .map((c) => String(c.email || '').trim().toLowerCase())
    .filter((e) => e.includes('@'));

  if (!emails.length) {
    return { trigger, candidates: 0, eligible: 0, unpaused: 0, emails: [], ms: Date.now() - started };
  }

  const grouped = await JobModel.aggregate([
    { $match: { userID: { $in: emails }, $or: ACTIVE_JOB_STATUS_OR } },
    { $group: { _id: '$userID', count: { $sum: 1 } } },
  ]);

  const countByEmail = new Map(grouped.map((g) => [String(g._id || '').toLowerCase(), g.count]));
  const eligible = emails.filter((e) => (countByEmail.get(e) || 0) >= AUTO_UNPAUSE_MIN_JOB_CARDS);

  const unpaused = [];
  for (const email of eligible) {
    try {
      // Sequential, not Promise.all: this writes to client records and appends
      // audit history, and the list is small by construction (only clients
      // still in New). Predictable ordering in the logs beats saving a second.
      if (await applyUnpause(email, countByEmail.get(email) || 0, trigger)) unpaused.push(email);
    } catch (e) {
      console.error(`[auto-unpause] failed for ${email}:`, e?.message || e);
    }
  }

  if (unpaused.length) invalidateAnalysisCaches();

  const summary = {
    trigger,
    candidates: emails.length,
    eligible: eligible.length,
    unpaused: unpaused.length,
    emails: unpaused,
    ms: Date.now() - started,
  };
  console.log(`[auto-unpause] sweep ${JSON.stringify(summary)}`);
  return summary;
}

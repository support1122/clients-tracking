/**
 * Attention alerts for the Client Job Analysis screen.
 *
 * Two failure modes, both of which used to be invisible on that page:
 *
 *   NO_ADDS      An active client has had no job card added for a full operator
 *                window or more. Nothing new is entering their pipeline.
 *
 *   NOT_APPLIED  An active client has job cards sitting in the saved column and
 *                nothing was applied for them today. Work is queued and not
 *                going out. This is the one the existing reminders could never
 *                see: runJobCardReminder nags on saved > 0 without checking
 *                whether anyone acted, so a backlog could sit untouched for days
 *                while Discord repeated the same message.
 *
 * The rules live here rather than inline in the route so they are testable and
 * so the screen, any future digest, and the cron can never disagree about what
 * "needs attention" means.
 */

/** Alert codes. Stable strings — the UI groups and filters on these. */
export const ALERT = {
  NO_ADDS: 'no_adds',
  NOT_APPLIED: 'not_applied',
};

/** A client is only owed work when they are active, unpaused and past onboarding. */
export function owesWork(row) {
  return String(row?.status || '') === 'active'
    && !row?.isPaused
    && !row?.onboardingPhase;
}

/**
 * Build the alert list for one row.
 *
 * Returns [] for any client we do not owe work to. Paused and inactive clients
 * legitimately get nothing added and nothing applied, and alerting on them would
 * bury the real signal and train operators to ignore the panel.
 *
 * @param {object} row  a client-job-analysis row, after add and apply stats are merged
 * @returns {{code: string, severity: 'critical'|'warning', label: string, detail: string}[]}
 */
export function deriveClientAlerts(row) {
  if (!owesWork(row)) return [];
  const alerts = [];

  // ── Nothing added ────────────────────────────────────────────────────────
  // daysSinceLastAdd is measured in whole 22:00 IST operator windows, so 1 means
  // "nothing at all in the window that just closed" — the 24-hour question.
  // null means no job card has EVER been added, which is worse than any number.
  const sinceAdd = row?.daysSinceLastAdd;
  if (sinceAdd == null || sinceAdd >= 1) {
    const never = sinceAdd == null;
    alerts.push({
      code: ALERT.NO_ADDS,
      // One quiet day is a warning an operator can still fix. Two or more means
      // it survived a full cycle of the daily reminders without anyone acting.
      severity: never || sinceAdd >= 2 ? 'critical' : 'warning',
      label: never
        ? 'No job card ever added'
        : sinceAdd === 1
          ? 'No jobs added in the last day'
          : `No jobs added for ${sinceAdd} days`,
      detail: never
        ? 'This active client has never had a job card added.'
        : `Last job card added ${sinceAdd} day${sinceAdd === 1 ? '' : 's'} ago. Target is ${row?.dailyTarget ?? 30}/day.`,
    });
  }

  // ── Saved but not applied ────────────────────────────────────────────────
  // Only fires when there is actually a backlog to act on. A client at zero
  // saved has nothing to apply to, and that is the NO_ADDS problem, not this one.
  const saved = Number(row?.saved || 0);
  const appliedToday = Number(row?.appliedToday || 0);
  if (saved > 0 && appliedToday === 0) {
    const sinceApply = row?.daysSinceLastApply;
    const stale = sinceApply == null || sinceApply >= 2;
    alerts.push({
      code: ALERT.NOT_APPLIED,
      severity: stale ? 'critical' : 'warning',
      label: `${saved} saved, none applied today`,
      detail: sinceApply == null
        // beyondLookback: nothing found in the 14-day window. Say exactly that
        // rather than inventing a number or claiming they never applied.
        ? `${saved} job card${saved === 1 ? '' : 's'} waiting and no application in the last 14 days.`
        : sinceApply === 0
          // Applied earlier today per appliedDate, but appliedToday is 0 — this
          // is only reachable if the two disagree, so state it plainly.
          ? `${saved} job card${saved === 1 ? '' : 's'} still waiting in the saved column.`
          : `${saved} job card${saved === 1 ? '' : 's'} waiting. Last application was ${sinceApply} day${sinceApply === 1 ? '' : 's'} ago.`,
    });
  }

  return alerts;
}

/**
 * Roll a set of rows up into the counts the header panel shows.
 *
 * @param {object[]} rows  rows that already carry an `alerts` array
 */
export function summariseAlerts(rows) {
  const out = { total: 0, clients: 0, critical: 0, byCode: { [ALERT.NO_ADDS]: 0, [ALERT.NOT_APPLIED]: 0 } };
  for (const r of rows || []) {
    const list = Array.isArray(r?.alerts) ? r.alerts : [];
    if (!list.length) continue;
    out.clients += 1;
    for (const a of list) {
      out.total += 1;
      if (a.severity === 'critical') out.critical += 1;
      if (a.code in out.byCode) out.byCode[a.code] += 1;
    }
  }
  return out;
}

/**
 * Start an AI summary build and wait for it to actually finish.
 *
 * POST /build-ai-summary does NOT return a finished summary. The build runs
 * 90-150s server-side (resume fetch plus two OpenAI passes), which is longer
 * than Cloudflare's ~100s origin timeout, so the endpoint is async: it replies
 * 202 with { success: true, buildStartedAt } and the caller polls
 * /ai-summary-status until the status leaves "building".
 *
 * Treating that 202 as "done" is the bug this module exists to prevent. A caller
 * that reloads the profile immediately reads the PREVIOUS summary, so the
 * operator sees nothing change, clicks again, and only lands on a fresh summary
 * once a reload happens to fall after some earlier build finished. That is the
 * "works on the third or fourth click" report.
 *
 * Shared by AdminSummariesPage and ClientAiSummary so the polling contract is
 * written once and the two screens cannot drift apart again.
 */

/**
 * The server caps one build at SUMMARY_BUILD_BUDGET_MS (8 min) and flags an
 * abandoned build at 9.5 min, so we wait a little past that. The server's own
 * verdict always lands first, which is what we want to report.
 */
export const SUMMARY_POLL_TIMEOUT_MS = 10.5 * 60 * 1000;
export const SUMMARY_POLL_INTERVAL_MS = 5000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {object}   o
 * @param {string}   o.base          DASHBOARD_BASE, no trailing slash
 * @param {string}   o.email         client email (lowercased here)
 * @param {number}  [o.timeoutMs]
 * @param {number}  [o.pollMs]
 * @param {() => boolean} [o.shouldAbort]  polled between ticks; lets a bulk run stop early
 * @returns {Promise<
 *   | { ok: true, status: object }
 *   | { ok: false, kind: 'start'|'failed', error: string, step: string, message: string }
 *   | { ok: false, kind: 'timeout'|'aborted' }
 * >}
 */
export async function buildAiSummaryAndWait({
  base,
  email,
  timeoutMs = SUMMARY_POLL_TIMEOUT_MS,
  pollMs = SUMMARY_POLL_INTERVAL_MS,
  shouldAbort,
}) {
  const addr = String(email || '').toLowerCase();

  const res = await fetch(`${base}/build-ai-summary`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: addr }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    return {
      ok: false,
      kind: 'start',
      error: body?.error || `HTTP ${res.status}`,
      step: body?.step || '',
      message: body?.message || '',
    };
  }

  // The moment the server accepted THIS build. A "done" whose builtAt predates
  // it belongs to an earlier run, so accepting it would report the previous
  // build's word count and reload the old summary as if we were finished.
  const since = new Date(body.buildStartedAt || body.requestedAt || Date.now()).getTime();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (shouldAbort?.()) return { ok: false, kind: 'aborted' };
    await sleep(pollMs);
    if (shouldAbort?.()) return { ok: false, kind: 'aborted' };

    let sbody = null;
    try {
      const sres = await fetch(`${base}/ai-summary-status?email=${encodeURIComponent(addr)}`);
      sbody = await sres.json().catch(() => null);
      if (!sres.ok || !sbody?.success) continue; // transient, keep polling
    } catch {
      continue; // network blip, keep polling
    }

    if (sbody.status === 'building') continue;
    if (sbody.status === 'done') {
      const builtAt = sbody.builtAt ? new Date(sbody.builtAt).getTime() : 0;
      // 2s of slack for clock skew between the app server and Mongo.
      if (!builtAt || builtAt < since - 2000) continue; // stale "done", keep waiting
    }

    if (sbody.status === 'error') {
      const e = sbody.lastError || {};
      return {
        ok: false,
        kind: 'failed',
        error: e.error || 'UNKNOWN',
        step: e.step || '',
        message: e.message || '',
      };
    }
    return { ok: true, status: sbody };
  }

  return { ok: false, kind: 'timeout' };
}

/** One-line, operator-readable description of a non-ok result. */
export function describeBuildFailure(result) {
  if (result.kind === 'timeout') {
    return 'Build is taking longer than expected. Click ↻ Refresh in a minute to check.';
  }
  if (result.kind === 'aborted') return 'Build cancelled.';
  const step = result.step ? ` [step: ${result.step}]` : '';
  return `Build failed: ${result.error}${step}${result.message ? ` — ${result.message}` : ''}`;
}

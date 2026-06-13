// Discord alerting for the milestone / payment-email pipeline.
//
// The webhook is intentionally HARD-CODED (per request) so alerts work even if
// no env var is configured. It posts beautified embeds to a single channel.
//
// Two entry points:
//   - notifyGmailAuthError(): immediate, prominent alert when the connected
//     Google account can no longer send (e.g. `invalid_grant`, token revoked).
//     Throttled so a bulk failure (52 clients at once) produces ONE ping.
//   - notifyMilestoneSweep(): a summary embed at the end of each sweep with
//     counts and a list of per-client failures + their error messages.
//
// Every function swallows its own errors — a failed notification must never
// break email sending or the cron sweep.

const MILESTONE_ALERT_WEBHOOK =
  'https://discord.com/api/webhooks/1481367775359270913/GIDwPQfOBhfdcnEMpraI5G8m9I7cl_OmsZ9BPsUwO67SNGO-r-u4XZ_f-T1CqZAOMmK9';

// Patterns that mean "the Google connection itself is broken" — these need a
// human to reconnect the account, so they get the loud red alert.
const AUTH_ERROR_PATTERNS = [
  // OAuth failures
  /invalid_grant/i,
  /token has been expired or revoked/i,
  /invalid_request/i,
  /invalid_client/i,
  /unauthorized/i,
  /insufficient.*permission/i,
  // SMTP / app-password failures
  /username and password not accepted/i,
  /invalid login/i,
  /\b535\b/,
  /\bEAUTH\b/,
  /bad credentials/i,
  /authentication failed/i,
];

export function isGmailAuthError(msg = '') {
  const s = String(msg || '');
  return AUTH_ERROR_PATTERNS.some((re) => re.test(s));
}

async function postEmbed(embed) {
  try {
    const res = await fetch(MILESTONE_ALERT_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      console.error(`[DiscordAlert] webhook responded ${res.status}: ${t}`);
    }
  } catch (e) {
    console.error('[DiscordAlert] post failed:', e?.message || e);
  }
}

// Throttle auth alerts so a sweep that hits invalid_grant on every client
// produces a single ping rather than one per client.
let _lastAuthAlertAt = 0;
const AUTH_ALERT_THROTTLE_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Loud alert when the connected Google account can't authenticate.
 * @param {Object} a
 * @param {string} a.error        - raw error message (e.g. "invalid_grant")
 * @param {string} [a.senderEmail]- the connected Google account
 * @param {string} [a.recipient]  - who we were trying to email
 * @param {string} [a.category]
 * @param {string} [a.type]
 */
export async function notifyGmailAuthError({ error, senderEmail, recipient, category, type } = {}) {
  const now = Date.now();
  if (now - _lastAuthAlertAt < AUTH_ALERT_THROTTLE_MS) return;
  _lastAuthAlertAt = now;

  const fields = [
    { name: 'Connected account', value: senderEmail || 'unknown', inline: true },
    { name: 'Error', value: '```' + String(error || 'unknown').slice(0, 300) + '```', inline: false },
  ];
  if (recipient) {
    fields.push({ name: 'While sending', value: `${category || 'email'}/${type || ''} → ${recipient}`, inline: false });
  }
  fields.push({
    name: '➡️ Action needed',
    value:
      '**If using SMTP:** regenerate the Gmail App Password and update `SMTP_PASS` in the backend env, then redeploy.\n' +
      '**If using OAuth:** portal → **Client Onboarding** → Google account menu → **Change account** and re-connect.\n' +
      'Milestone & payment emails will NOT go out until this is fixed.',
    inline: false,
  });

  await postEmbed({
    title: '🔐 Gmail authorization error — emails are NOT sending',
    color: 0xef4444, // red
    description: 'The Google account used to send milestone / payment emails can no longer authenticate.',
    fields,
    footer: { text: 'FlashFire • Milestone email monitor' },
  });
}

/**
 * Summary embed posted at the end of a milestone sweep.
 * Silent no-op runs (nothing sent, no failures) are skipped to avoid noise.
 * @param {Object} summary - { processed, sent, failed, skipped, errors, tookMs, details[] }
 * @param {Object} [opts]  - { trigger, senderEmail }
 */
export async function notifyMilestoneSweep(summary = {}, { trigger = 'cron', senderEmail } = {}) {
  const details = Array.isArray(summary.details) ? summary.details : [];
  const failures = details.filter((d) => d && (d.status === 'failed' || d.status === 'error'));
  const sent = summary.sent || 0;

  // Nothing happened and nothing broke → don't ping.
  if (!sent && !failures.length) return;

  const hasAuth = failures.some((f) => isGmailAuthError(f.error));
  const failCount = (summary.failed || 0) + (summary.errors || 0);

  let statusLine, color;
  if (failures.length) {
    statusLine = hasAuth ? '🔐 Auth error — emails NOT sending' : '⚠️ Completed with failures';
    color = hasAuth ? 0xef4444 : 0xf59e0b; // red / amber
  } else {
    statusLine = '✅ Completed';
    color = 0x22c55e; // green
  }

  const fields = [
    { name: 'Trigger', value: String(trigger || 'cron'), inline: true },
    { name: 'Sender', value: senderEmail || 'not connected', inline: true },
    { name: 'Duration', value: summary.tookMs ? `${(summary.tookMs / 1000).toFixed(1)}s` : '—', inline: true },
    { name: 'Processed', value: String(summary.processed || 0), inline: true },
    { name: '📤 Sent', value: String(sent), inline: true },
    { name: '❌ Failed', value: String(failCount), inline: true },
  ];

  if (failures.length) {
    const lines = failures.slice(0, 10).map((f) => {
      const who = f.clientEmail || '?';
      const ms = f.milestone ? ` (${f.milestone})` : '';
      const err = String(f.error || 'unknown').slice(0, 140);
      return `• ${who}${ms} — ${err}`;
    });
    const extra = failures.length > 10 ? `\n…and ${failures.length - 10} more` : '';
    fields.push({
      name: `Failures (${failures.length})`,
      value: (lines.join('\n') + extra).slice(0, 1024),
      inline: false,
    });
  }

  if (hasAuth) {
    fields.push({
      name: '➡️ Action needed',
      value: 'Reconnect the Google account: portal → **Client Onboarding** → Google account → **Change account**.',
      inline: false,
    });
  }

  await postEmbed({
    title: `📬 Milestone Email Sweep — ${statusLine}`,
    color,
    fields,
    footer: { text: 'FlashFire • Daily 9 PM IST sweep' },
  });
}

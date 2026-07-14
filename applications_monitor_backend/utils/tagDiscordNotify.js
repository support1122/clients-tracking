/**
 * Per-user Discord tag notifications. Each portal user can store a personal
 * channel webhook (UserModel.discordWebhookUrl); tagging them in a ticket
 * comment posts an embed there — immediately on tag, then as repeating
 * reminders (utils/chatCrons.js) until they resolve the comment.
 *
 * Every function swallows its own errors: a broken/deleted webhook must never
 * break comment saving or a cron sweep.
 */

const WEBHOOK_RX = /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/;

export function isValidDiscordWebhook(url) {
  return WEBHOOK_RX.test(String(url || '').trim());
}

/**
 * @param {object} p
 * @param {string} p.webhookUrl   The user's personal channel webhook.
 * @param {string} p.recipientName
 * @param {string} p.authorName   Who tagged them.
 * @param {string} p.snippet      Comment excerpt.
 * @param {string} p.clientName
 * @param {number|null} p.clientNumber
 * @param {number|null} p.jobNumber
 * @param {number} [p.reminderNumber]  0/undefined = first notification; >0 = Nth reminder.
 * @returns {Promise<boolean>} true if Discord accepted the message.
 */
export async function sendTagDiscordPing({
  webhookUrl,
  recipientName,
  authorName,
  snippet,
  clientName,
  clientNumber,
  jobNumber,
  reminderNumber = 0
}) {
  if (!isValidDiscordWebhook(webhookUrl)) return false;
  const clientLabel = `${clientNumber != null ? `${clientNumber} – ` : ''}${clientName || 'a client'}`;
  const isReminder = reminderNumber > 0;
  const embed = {
    title: isReminder
      ? `⏰ Reminder #${reminderNumber} — unresolved tag on ${clientLabel}`
      : `📌 You got tagged on ${clientLabel}`,
    description: [
      `**${authorName || 'Someone'}** tagged ${recipientName ? `**${recipientName}**` : 'you'} in ticket **#${jobNumber ?? '—'}** (${clientLabel}):`,
      '',
      snippet ? `> ${String(snippet).slice(0, 500)}` : '> (image)',
      '',
      '**Please resolve this.**'
    ].join('\n'),
    color: isReminder ? 0xf59e0b : 0xdf5830, // amber for reminders, brand orange for the first ping
    timestamp: new Date().toISOString(),
    footer: { text: 'FlashFire Client Tracking · resolve the tag on the ticket to stop reminders' }
  };
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] })
    });
    if (!res.ok) {
      console.warn(`[Tag Discord] webhook responded ${res.status} for ${recipientName || 'user'}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[Tag Discord] post failed:', e?.message || e);
    return false;
  }
}

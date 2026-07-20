import { ChatMessageModel, ChatConversationModel } from '../ChatModels.js';
import { OnboardingJobModel } from '../OnboardingJobModel.js';
import { UserModel } from '../UserModel.js';
import { TagReminderModel } from '../TagReminderModel.js';
import { sendTagNotificationEmail } from './sendTagNotificationEmail.js';
import { sendTagDiscordPing } from './tagDiscordNotify.js';
import { sendChatMessageInternal } from '../controllers/chatController.js';

const SYSTEM_EMAIL = 'system-auto@flashfire-clients-tracking.internal';
const EMAIL_AFTER_MS = 30 * 60 * 1000; // email if unread in chat for 30 min
const ADMIN_AFTER_MS = 3 * 60 * 60 * 1000; // notify admins if unread for 3 h

const recipientOf = (convo, senderEmail) =>
  (convo?.participants || []).find((p) => p !== (senderEmail || '').toLowerCase()) || null;

/**
 * Escalation sweep (every 10 min).
 * Stage 1 — tag messages unread 30+ min: send the tag notification email that
 *   used to fire immediately (now conditional, so reading chat in time means
 *   zero email noise). Read-in-time messages are just marked handled.
 * Stage 2 — tag messages unread 3+ h: DM every admin from System so a human
 *   can chase it up.
 */
let sweepRunning = false;

export async function runChatEscalationSweep() {
  // A slow sweep (SMTP timeouts) must not overlap the next 10-min tick —
  // overlapping sweeps could double-send the same escalation email.
  if (sweepRunning) {
    console.warn('[Chat Escalation] previous sweep still running — skipping this tick');
    return;
  }
  sweepRunning = true;
  try {
    await runSweepOnce();
  } finally {
    sweepRunning = false;
  }
}

async function runSweepOnce() {
  const now = new Date();

  // ── Stage 1: conditional email after 30 min ──
  try {
    const candidates = await ChatMessageModel.find({
      source: 'tag',
      'ticket.jobId': { $ne: null },
      'escalation.emailSentAt': null,
      createdAt: { $lt: new Date(now.getTime() - EMAIL_AFTER_MS) }
    }).sort({ createdAt: 1 }).limit(200).lean();

    for (const msg of candidates) {
      const convo = await ChatConversationModel.findById(msg.conversationId).select('participants').lean();
      const recipient = recipientOf(convo, msg.senderEmail);
      const markHandled = () =>
        ChatMessageModel.updateOne({ _id: msg._id }, { $set: { 'escalation.emailSentAt': now } });

      if (!recipient) { await markHandled(); continue; }
      if ((msg.readBy || []).includes(recipient)) {
        // Read in chat within the window — no email needed.
        await markHandled();
        continue;
      }
      const user = await UserModel.findOne({ email: recipient }).select('email otpEmail name').lean();
      const toEmail = (user?.otpEmail || '').trim() || recipient;
      try {
        await sendTagNotificationEmail({
          toEmail,
          recipientName: user?.name || recipient,
          authorName: msg.senderName || msg.senderEmail,
          commentSnippet: (msg.text || '').slice(0, 120),
          jobNumber: msg.ticket.jobNumber,
          clientName: msg.ticket.clientName || '',
          clientNumber: msg.ticket.clientNumber ?? null,
          jobId: String(msg.ticket.jobId)
        });
        console.log(`[Chat Escalation] emailed ${toEmail} (unread 30m) — job #${msg.ticket.jobNumber}`);
      } catch (e) {
        console.error('[Chat Escalation] email failed:', e?.message || e);
      }
      // Mark handled either way so a permanently-failing address can't wedge the sweep.
      await markHandled();
    }
  } catch (e) {
    console.error('[Chat Escalation] stage-1 sweep error:', e?.message || e);
  }

  // ── Stage 2: admin heads-up after 3 h ──
  try {
    const stale = await ChatMessageModel.find({
      source: 'tag',
      'ticket.jobId': { $ne: null },
      'escalation.adminNotifiedAt': null,
      createdAt: { $lt: new Date(now.getTime() - ADMIN_AFTER_MS) }
    }).sort({ createdAt: 1 }).limit(100).lean();

    let admins = null; // lazy-load once per sweep
    for (const msg of stale) {
      const convo = await ChatConversationModel.findById(msg.conversationId).select('participants').lean();
      const recipient = recipientOf(convo, msg.senderEmail);
      const markHandled = () =>
        ChatMessageModel.updateOne({ _id: msg._id }, { $set: { 'escalation.adminNotifiedAt': now } });

      if (!recipient || (msg.readBy || []).includes(recipient)) { await markHandled(); continue; }

      if (!admins) {
        admins = await UserModel.find({ role: 'admin', isActive: true }).select('email name').lean();
      }
      const recipientUser = await UserModel.findOne({ email: recipient }).select('name').lean();
      const recipientName = recipientUser?.name || recipient;
      const hours = Math.floor((now - new Date(msg.createdAt)) / 3600000);
      for (const admin of admins) {
        if (admin.email.toLowerCase() === recipient) continue; // don't report someone to themselves
        await sendChatMessageInternal({
          fromEmail: SYSTEM_EMAIL,
          fromName: 'System',
          toEmail: admin.email,
          toName: admin.name || admin.email,
          text: `⏰ ${recipientName} hasn't read a tagged message from ${msg.senderName || msg.senderEmail} about ${msg.ticket.clientName || 'a client'} (#${msg.ticket.jobNumber}) for ${hours}h.`,
          ticket: msg.ticket,
          source: 'system'
        });
      }
      await markHandled();
      console.log(`[Chat Escalation] admins notified — ${recipient} unread 3h on job #${msg.ticket.jobNumber}`);
    }
  } catch (e) {
    console.error('[Chat Escalation] stage-2 sweep error:', e?.message || e);
  }
}

// ── Discord tag reminders ────────────────────────────────────────────────────
const FIRST_REMINDER_AFTER_MS = 2 * 60 * 60 * 1000; // first reminder 2h after the tag
const REMINDER_INTERVAL_MS = 3 * 60 * 60 * 1000; // then every 3h
const MAX_REMINDERS = 8; // hard stop — resolving the comment is the real off-switch

let remindersRunning = false;

/**
 * Repeating Discord reminders (every 30 min sweep) for tagged comments that
 * are still unresolved. The immediate ping fires at tag time; this re-pings
 * the user's personal webhook until they resolve the comment on the ticket
 * (which removes them from the unresolved set) or MAX_REMINDERS is hit.
 */
export async function runTagDiscordReminders() {
  if (remindersRunning) return;
  remindersRunning = true;
  try {
    const now = Date.now();
    const rows = await OnboardingJobModel.aggregate([
      { $match: { 'comments.0': { $exists: true } } },
      { $unwind: '$comments' },
      { $match: { $expr: { $gt: [{ $size: { $ifNull: ['$comments.taggedUserIds', []] } }, 0] } } },
      { $match: { 'comments.createdAt': { $lt: new Date(now - FIRST_REMINDER_AFTER_MS) } } },
      {
        $addFields: {
          resolvedEmails: {
            $map: {
              input: { $ifNull: ['$comments.resolvedByTagged', []] },
              as: 'r',
              in: { $toLower: { $trim: { input: { $ifNull: ['$$r.email', ''] } } } }
            }
          },
          taggedEmails: {
            $map: {
              input: { $ifNull: ['$comments.taggedUserIds', []] },
              as: 't',
              in: { $toLower: { $trim: { input: { $ifNull: ['$$t', ''] } } } }
            }
          }
        }
      },
      {
        $addFields: {
          unresolvedTagged: {
            $filter: {
              input: '$taggedEmails',
              as: 'e',
              cond: { $and: [{ $ne: ['$$e', ''] }, { $not: { $in: ['$$e', '$resolvedEmails'] } }] }
            }
          }
        }
      },
      { $match: { $expr: { $gt: [{ $size: '$unresolvedTagged' }, 0] } } },
      {
        $project: {
          jobNumber: 1,
          clientName: 1,
          clientNumber: 1,
          commentId: '$comments._id',
          commentBody: '$comments.body',
          commentAuthorName: '$comments.authorName',
          unresolvedTagged: 1
        }
      },
      { $limit: 500 }
    ]);
    if (!rows.length) return;

    // One user lookup for the whole sweep — only users with a webhook matter.
    const allEmails = [...new Set(rows.flatMap((r) => r.unresolvedTagged))];
    const users = await UserModel.find({
      email: { $in: allEmails },
      discordWebhookUrl: { $nin: [null, ''] }
    }).select('email name discordWebhookUrl').lean();
    const userMap = new Map(users.map((u) => [u.email.toLowerCase(), u]));
    if (!userMap.size) return;

    let sent = 0;
    for (const row of rows) {
      for (const email of row.unresolvedTagged) {
        const user = userMap.get(email);
        if (!user) continue;
        const key = { jobId: row._id, commentId: String(row.commentId), userEmail: email };
        const log = await TagReminderModel.findOne(key).lean();
        if (log?.count >= MAX_REMINDERS) continue;
        if (log?.lastSentAt && now - new Date(log.lastSentAt).getTime() < REMINDER_INTERVAL_MS) continue;

        const ok = await sendTagDiscordPing({
          webhookUrl: user.discordWebhookUrl,
          recipientName: user.name || email,
          authorName: row.commentAuthorName || 'Someone',
          snippet: (row.commentBody || '(image)').slice(0, 300),
          clientName: row.clientName || '',
          clientNumber: row.clientNumber ?? null,
          jobNumber: row.jobNumber,
          reminderNumber: (log?.count || 0) + 1
        });
        // Record the attempt either way so a dead webhook can't spam retries
        // every sweep — it still respects the 3h interval and the cap.
        await TagReminderModel.updateOne(
          key,
          { $inc: { count: 1 }, $set: { lastSentAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
          { upsert: true }
        );
        if (ok) sent++;
      }
    }
    if (sent) console.log(`[Tag Reminders] sent ${sent} Discord reminder(s)`);
  } catch (e) {
    console.error('[Tag Reminders] sweep error:', e?.message || e);
  } finally {
    remindersRunning = false;
  }
}

/**
 * Daily digest to every admin (9:00 AM IST): active tickets, pending move
 * requests, unresolved tagged comments — the operational front door.
 */
export async function runAdminDailyDigest() {
  try {
    const [activeTickets, pendingMoves, unresolvedAgg] = await Promise.all([
      OnboardingJobModel.countDocuments({ status: { $ne: 'completed' } }),
      OnboardingJobModel.countDocuments({ 'pendingMoveRequest.active': true }),
      OnboardingJobModel.aggregate([
        { $match: { 'comments.0': { $exists: true } } },
        { $unwind: '$comments' },
        { $match: { $expr: { $gt: [{ $size: { $ifNull: ['$comments.taggedUserIds', []] } }, 0] } } },
        {
          $addFields: {
            resolvedEmails: {
              $map: {
                input: { $ifNull: ['$comments.resolvedByTagged', []] },
                as: 'r',
                in: { $toLower: { $trim: { input: { $ifNull: ['$$r.email', ''] } } } }
              }
            },
            taggedEmails: {
              $map: {
                input: { $ifNull: ['$comments.taggedUserIds', []] },
                as: 't',
                in: { $toLower: { $trim: { input: { $ifNull: ['$$t', ''] } } } }
              }
            }
          }
        },
        {
          $match: {
            $expr: {
              $gt: [
                { $size: { $filter: {
                  input: '$taggedEmails',
                  as: 'e',
                  cond: { $and: [{ $ne: ['$$e', ''] }, { $not: { $in: ['$$e', '$resolvedEmails'] } }] }
                } } },
                0
              ]
            }
          }
        },
        { $count: 'n' }
      ])
    ]);
    const unresolvedComments = unresolvedAgg?.[0]?.n || 0;

    const dateLabel = new Date().toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long'
    });
    const text = [
      `📋 Daily digest — ${dateLabel}`,
      `• ${activeTickets} active onboarding ticket${activeTickets === 1 ? '' : 's'}`,
      `• ${pendingMoves} pending move request${pendingMoves === 1 ? '' : 's'} awaiting approval`,
      `• ${unresolvedComments} unresolved tagged comment${unresolvedComments === 1 ? '' : 's'}`,
      '',
      'Review them in the Unresolved panel on Client Onboarding.'
    ].join('\n');

    const admins = await UserModel.find({ role: 'admin', isActive: true }).select('email name').lean();
    for (const admin of admins) {
      await sendChatMessageInternal({
        fromEmail: SYSTEM_EMAIL,
        fromName: 'System',
        toEmail: admin.email,
        toName: admin.name || admin.email,
        text,
        source: 'system'
      });
    }
    console.log(`[Admin Digest] sent to ${admins.length} admin(s)`);
  } catch (e) {
    console.error('[Admin Digest] failed:', e?.message || e);
  }
}

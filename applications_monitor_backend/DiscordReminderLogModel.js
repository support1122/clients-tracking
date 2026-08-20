import mongoose from 'mongoose';

const DiscordReminderLogSchema = new mongoose.Schema(
  {
    reminderType: {
      type: String,
      // 'add_shortfall' is the daily 21:30 IST report naming every active client
      // under their add target. Adding it here is not optional: postDiscordReminder
      // writes this log on BOTH the success and failure paths, so an unlisted
      // value would fail schema validation and turn a delivered Discord message
      // into a thrown error.
      enum: ['job_card', 'zero_saved', 'add_shortfall', 'manual'],
      default: 'manual',
      index: true,
    },
    status: {
      type: String,
      enum: ['sent', 'failed'],
      required: true,
      index: true,
    },
    webhookTag: { type: String, default: '' },
    message: { type: String, required: true },
    clientEmail: { type: String, default: '' },
    clientName: { type: String, default: '' },
    addedBy: { type: String, default: '' },
    responseStatus: { type: Number },
    responseText: { type: String, default: '' },
    error: { type: String, default: '' },
    triggeredBy: { type: String, default: '' },
    triggeredSource: {
      type: String,
      enum: ['cron', 'manual', 'retry'],
      default: 'cron',
      index: true,
    },
    metadata: { type: Object, default: {} },
  },
  {
    collection: 'discord_reminder_logs',
    timestamps: true,
  }
);

DiscordReminderLogSchema.index({ createdAt: -1 });
DiscordReminderLogSchema.index({ reminderType: 1, createdAt: -1 });

export const DiscordReminderLogModel =
  mongoose.models.DiscordReminderLog ||
  mongoose.model('DiscordReminderLog', DiscordReminderLogSchema);

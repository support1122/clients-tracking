import mongoose from 'mongoose';

// Tracks Discord reminders for an unresolved tagged comment, one doc per
// (job, comment, tagged user). Resolving the comment removes the user from
// the unresolved set, so the cron simply stops finding them — no cleanup
// needed here. `count` caps runaway reminders.
const tagReminderSchema = new mongoose.Schema({
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'OnboardingJob', required: true },
  commentId: { type: String, required: true },
  userEmail: { type: String, required: true, lowercase: true, trim: true },
  count: { type: Number, default: 0 },
  lastSentAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

tagReminderSchema.index({ jobId: 1, commentId: 1, userEmail: 1 }, { unique: true });

export const TagReminderModel = mongoose.model('TagReminder', tagReminderSchema);

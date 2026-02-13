import mongoose from 'mongoose';

const onboardingNotificationSchema = new mongoose.Schema({
  userEmail: { type: String, required: true, lowercase: true, trim: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'OnboardingJob', required: true },
  jobNumber: { type: Number, required: true },
  clientName: { type: String, required: true },
  commentSnippet: { type: String, default: '' },
  authorEmail: { type: String, default: '' },
  authorName: { type: String, default: '' },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

onboardingNotificationSchema.index({ userEmail: 1, read: 1 });
onboardingNotificationSchema.index({ userEmail: 1, createdAt: -1 });

export const OnboardingNotificationModel = mongoose.model('OnboardingNotification', onboardingNotificationSchema);

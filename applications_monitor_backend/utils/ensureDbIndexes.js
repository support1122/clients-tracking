/**
 * Run after mongoose.connect() succeeds. Index creation must not run at model import time
 * or Mongoose buffers operations and can throw "buffering timed out after 10000ms" when the DB is slow/unreachable.
 */
import { JobModel } from '../JobModel.js';
import { ExtensionIncentiveComplaintModel } from '../ExtensionIncentiveComplaintModel.js';
import { UserModel } from '../UserModel.js';
import { ManagerModel } from '../ManagerModel.js';
import { CallLogModel } from '../CallLogModel.js';
import { OnboardingJobModel } from '../OnboardingJobModel.js';

export async function ensureDbIndexes() {
  await Promise.all([
    JobModel.collection.createIndex({ createdAt: 1 }),
    JobModel.collection.createIndex({ appliedDate: 1 }),
    JobModel.collection.createIndex({ dateAdded: 1 }),
    JobModel.collection.createIndex({ updatedAt: 1 }),
    JobModel.collection.createIndex({ currentStatus: 1 }),
    JobModel.collection.createIndex({ userID: 1 }),
    JobModel.collection.createIndex({ operatorEmail: 1 }),
    JobModel.collection.createIndex({ operatorEmail: 1, appliedDate: 1, currentStatus: 1 }),
    JobModel.collection.createIndex({ operatorEmail: 1, appliedDate: 1, downloaded: 1 }),
    JobModel.collection.createIndex({ currentStatus: 1, appliedDate: 1 }),
    JobModel.collection.createIndex({ userID: 1, operatorName: 1, appliedDate: 1 }),
    // Serves the client-job-analysis "overall counts" group ({userID, currentStatus})
    // as a covered index scan — no document fetch over the whole collection.
    JobModel.collection.createIndex({ userID: 1, currentStatus: 1 }),
    UserModel.collection.createIndex({ email: 1 }, { unique: true }),
    UserModel.collection.createIndex({ isActive: 1 }),
    UserModel.collection.createIndex({ isActive: 1, onboardingSubRole: 1 }),
    UserModel.collection.createIndex({ lastResumeAssignedAt: 1 }),
    UserModel.collection.createIndex({ lastLinkedInAssignedAt: 1 }),
    ManagerModel.collection.createIndex({ fullName: 1, isActive: 1 }),
    ManagerModel.collection.createIndex({ isActive: 1 }),
    CallLogModel.collection.createIndex({ status: 1 }),
    CallLogModel.collection.createIndex({ twilioCallSid: 1 }),
    CallLogModel.collection.createIndex({ phoneNumber: 1, createdAt: -1 }),
    CallLogModel.collection.createIndex({ scheduledFor: 1, status: 1 }),
    ExtensionIncentiveComplaintModel.collection.createIndex({ dateYmd: 1, addedBy: 1 }),
    ExtensionIncentiveComplaintModel.collection.createIndex({ createdAt: -1 }),
    // NOTE: the 'users' collection already has a UNIQUE { email: 1 } index (created
    // by the app that owns that model), which already serves the referral $in
    // lookup in client-job-analysis. Do NOT add a second { email: 1 } here — a
    // non-unique createIndex collides with the existing auto-named "email_1".
    // Onboarding "non-resolved issues" admin view filters/unwinds on comments tags.
    // (Per-client email-log index { clientEmail:1, createdAt:-1 } is already declared
    //  on ClientEmailLogSchema itself, so it is not repeated here.)
    OnboardingJobModel.collection.createIndex({ 'comments.taggedUserIds': 1 })
  ]);
}

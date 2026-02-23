import mongoose from 'mongoose';

const ONBOARDING_STATUSES = [
  'resume_in_progress',
  'resume_draft_done',
  'resume_in_review',
  'resume_approved',
  'linkedin_in_progress',
  'linkedin_done',
  'cover_letter_in_progress',
  'cover_letter_done',
  'applications_ready',
  'applications_in_progress',
  'completed'
];

const resolvedByTaggedSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true },
  resolvedAt: { type: Date, default: Date.now }
}, { _id: false });

const commentImageSchema = new mongoose.Schema({
  url: { type: String, required: true },
  filename: { type: String, default: '' }
}, { _id: false });

const commentSchema = new mongoose.Schema({
  body: { type: String, required: true },
  authorEmail: { type: String, required: true },
  authorName: { type: String, default: '' },
  taggedUserIds: [{ type: String }],
  taggedNames: [{ type: String }],
  resolvedByTagged: [resolvedByTaggedSchema],
  images: [commentImageSchema],
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const moveHistorySchema = new mongoose.Schema({
  fromStatus: { type: String, required: true },
  toStatus: { type: String, required: true },
  movedBy: { type: String, required: true },
  movedAt: { type: Date, default: Date.now }
}, { _id: false });

const gmailCredentialHistorySchema = new mongoose.Schema({
  username: { type: String, default: '' },
  password: { type: String, default: '' },
  updatedBy: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now }
}, { _id: true });

const attachmentSchema = new mongoose.Schema({
  url: { type: String, required: true },
  filename: { type: String, required: true },
  name: { type: String, default: '' }, // Display name (like Notion)
  uploadedAt: { type: Date, default: Date.now },
  uploadedBy: { type: String, default: '' }
}, { _id: false });

const onboardingJobSchema = new mongoose.Schema({
  jobNumber: { type: Number, required: true, unique: true },
  clientNumber: { type: Number, required: false, default: null },
  clientEmail: { type: String, required: true, lowercase: true, trim: true },
  clientName: { type: String, required: true, trim: true },
  planType: { type: String, default: 'Professional', trim: true },
  status: { type: String, required: true, enum: ONBOARDING_STATUSES, default: 'resume_in_progress' },
  csmEmail: { type: String, default: '', trim: true, lowercase: true },
  csmName: { type: String, default: '', trim: true },
  resumeMakerEmail: { type: String, default: '', trim: true, lowercase: true },
  resumeMakerName: { type: String, default: '', trim: true },
  linkedInMemberEmail: { type: String, default: '', trim: true, lowercase: true },
  linkedInMemberName: { type: String, default: '', trim: true },
  dashboardManagerName: { type: String, default: '', trim: true },
  bachelorsStartDate: { type: String, default: '', trim: true },
  mastersEndDate: { type: String, default: '', trim: true },
  dashboardCredentials: {
    username: { type: String, default: '' },
    password: { type: String, default: '' },
    loginUrl: { type: String, default: '' }
  },
  gmailCredentials: {
    username: { type: String, default: '' },
    password: { type: String, default: '' }
  },
  gmailCredentialsHistory: [gmailCredentialHistorySchema],
  attachments: [attachmentSchema],
  comments: [commentSchema],
  moveHistory: [moveHistorySchema],
  linkedInPhaseStarted: { type: Boolean, default: false },
  // Pre-computed counter: incremented when a non-admin posts a comment, zeroed when any admin reads the job.
  // Stored on the document so it costs zero extra DB queries on the list endpoint.
  adminUnreadCount: { type: Number, default: 0, min: 0 },
  // Move approval workflow: non-privileged users request a move; team_lead/admin approves or rejects.
  pendingMoveRequest: {
    targetStatus: { type: String, default: '' },
    requestedBy: { type: String, default: '' },
    requestedByName: { type: String, default: '' },
    requestedAt: { type: Date, default: null },
    active: { type: Boolean, default: false }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

onboardingJobSchema.index({ status: 1 });
onboardingJobSchema.index({ clientEmail: 1 });
onboardingJobSchema.index({ status: 1, jobNumber: 1 });
onboardingJobSchema.index({ updatedAt: -1 });

export const ONBOARDING_STATUSES_LIST = ONBOARDING_STATUSES;
export const OnboardingJobModel = mongoose.model('OnboardingJob', onboardingJobSchema);

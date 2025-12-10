import mongoose from 'mongoose';

const CallLogSchema = new mongoose.Schema(
  {
    phoneNumber: { type: String, required: true },
    scheduledFor: { type: Date, required: true },
    announceTimeText: { type: String },
    twilioCallSid: { type: String },
    callStatus: { type: String },
    callDurationSec: { type: Number },
    callStartAt: { type: Date },
    callEndAt: { type: Date },
    status: {
      type: String,
      enum: ['scheduled', 'queued', 'in_progress', 'calling', 'completed', 'failed'],
      default: 'queued',
    },
    jobId: { type: String },
    attemptAt: { type: Date },
    error: { type: String },
    statusHistory: [
      {
        event: { type: String },
        status: { type: String },
        timestamp: { type: Date, default: Date.now },
        raw: { type: Object },
      }
    ],
  },
  { timestamps: true }
);

export const CallLogModel =
  mongoose.models.CallLog || mongoose.model('CallLog', CallLogSchema);



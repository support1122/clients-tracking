import mongoose from 'mongoose';

/**
 * Persisted daily incentive record for extension operators.
 * Created/updated by the 1:00 PM IST cron job.
 * Admins can reject records (with reason); operators can view their history.
 */
const ExtensionDailyIncentiveSchema = new mongoose.Schema(
  {
    /** IST calendar day YYYY-MM-DD */
    dateYmd: { type: String, required: true, trim: true },
    /** Operator name from extension (addedBy) */
    addedBy: { type: String, required: true, trim: true },
    /** Number of qualified clients (20+ jobs added for them) */
    qualifiedClients: { type: Number, default: 0 },
    /** Total jobs added that day */
    totalJobs: { type: Number, default: 0 },
    /** Jobs added before 1 PM IST */
    jobsBefore1pm: { type: Number, default: 0 },
    /** Incentive amount in INR (₹) */
    incentiveAmount: { type: Number, default: 0 },
    /** Status: approved (default from cron), rejected (by admin) */
    status: {
      type: String,
      enum: ['approved', 'rejected'],
      default: 'approved',
    },
    /** Admin who rejected (if rejected) */
    rejectedBy: { type: String, default: '' },
    /** When it was rejected */
    rejectedAt: { type: Date, default: null },
    /** Reason for rejection */
    rejectionReason: { type: String, default: '' },
    /** Breakdown of clients and their job counts */
    clientBreakdown: [
      {
        clientEmail: { type: String },
        jobCount: { type: Number },
        qualified: { type: Boolean },
      },
    ],
    /** Whether all jobs were before 1 PM IST */
    allBefore1pm: { type: Boolean, default: false },
    /** Timestamp when the cron created/updated this record */
    computedAt: { type: Date, default: Date.now },
  },
  {
    collection: 'extension_daily_incentives',
    timestamps: true,
  }
);

// Unique per operator per day
ExtensionDailyIncentiveSchema.index({ dateYmd: 1, addedBy: 1 }, { unique: true });
// For searching by operator
ExtensionDailyIncentiveSchema.index({ addedBy: 1, dateYmd: -1 });
// For admin search by status
ExtensionDailyIncentiveSchema.index({ status: 1, dateYmd: -1 });
// For date range queries
ExtensionDailyIncentiveSchema.index({ dateYmd: -1 });

export const ExtensionDailyIncentiveModel = mongoose.model(
  'ExtensionDailyIncentive',
  ExtensionDailyIncentiveSchema
);

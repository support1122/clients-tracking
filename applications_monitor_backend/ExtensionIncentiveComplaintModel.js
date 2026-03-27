import mongoose from 'mongoose';

const ExtensionIncentiveComplaintSchema = new mongoose.Schema(
  {
    /** IST calendar day YYYY-MM-DD */
    dateYmd: { type: String, required: true, trim: true },
    /** Operator name from extension (addedBy) */
    addedBy: { type: String, required: true, trim: true },
    clientEmail: { type: String, default: '', trim: true },
    note: { type: String, default: '' },
    createdBy: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'extension_incentive_complaints' }
);

ExtensionIncentiveComplaintSchema.index({ dateYmd: 1, addedBy: 1 });
ExtensionIncentiveComplaintSchema.index({ createdAt: -1 });

export const ExtensionIncentiveComplaintModel = mongoose.model(
  'ExtensionIncentiveComplaint',
  ExtensionIncentiveComplaintSchema
);

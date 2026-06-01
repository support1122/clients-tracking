import mongoose from "mongoose";

const ClientEmailLogSchema = new mongoose.Schema(
  {
    // For milestone emails this is the FlashFire client email; for OTP/tag/other it's the recipient email.
    // No `index: true` here — the compound `{ clientEmail: 1, createdAt: -1 }` index
    // declared below already covers clientEmail-only lookups (it's the prefix).
    clientEmail: { type: String, required: true, lowercase: true },
    // Original recipient (kept distinct from clientEmail for milestone where paymentEmail differs).
    toEmail: { type: String, lowercase: true, default: "" },
    // Milestone-only payment email (kept for backward compat). Optional now that this log is generic.
    paymentEmail: { type: String, lowercase: true, default: "" },
    // Broad category. milestone | otp | tag | manual | other.
    category: {
      type: String,
      enum: ["milestone", "otp", "tag", "manual", "other"],
      default: "other",
      index: true
    },
    // Free-form sub-type. Milestone values: started/count_250/count_350/count_700/completed. OTP/tag use category-specific tags.
    type: { type: String, required: true },
    subject: { type: String, required: true },
    status: { type: String, required: true, enum: ["success", "failed"] },
    errorMessage: { type: String, default: null },
    provider: { type: String, default: "gmail" },
    fromEmail: { type: String, lowercase: true, default: "" },
    snapshot: {
      planType: { type: String, default: "" },
      planCap: { type: Number, default: 0 },
      currentCount: { type: Number, default: 0 },
      percent: { type: Number, default: 0 }
    },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

ClientEmailLogSchema.index({ clientEmail: 1, createdAt: -1 });
ClientEmailLogSchema.index({ category: 1, createdAt: -1 });

export const ClientEmailLogModel = mongoose.model("ClientEmailLog", ClientEmailLogSchema);

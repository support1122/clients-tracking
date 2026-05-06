import mongoose from "mongoose";

const ClientEmailLogSchema = new mongoose.Schema(
  {
    clientEmail: { type: String, required: true, lowercase: true, index: true },
    paymentEmail: { type: String, required: true, lowercase: true },
    // Free-form milestone identifier. Old values: resume_ready/apps_started/pct30/50/75/100.
    // New values: started, count_250, count_350, count_700, completed.
    type: {
      type: String,
      required: true
    },
    subject: { type: String, required: true },
    status: { type: String, required: true, enum: ["success", "failed"] },
    errorMessage: { type: String, default: null },
    provider: { type: String, default: "sendgrid" },
    snapshot: {
      planType: { type: String, default: "" },
      planCap: { type: Number, default: 0 },
      currentCount: { type: Number, default: 0 },
      percent: { type: Number, default: 0 }
    }
  },
  { timestamps: true }
);

ClientEmailLogSchema.index({ clientEmail: 1, createdAt: -1 });

export const ClientEmailLogModel = mongoose.model("ClientEmailLog", ClientEmailLogSchema);

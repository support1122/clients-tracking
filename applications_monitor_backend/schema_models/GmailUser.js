import mongoose from "mongoose";

const GmailUserSchema = new mongoose.Schema(
  {
    email: { type: String, unique: true, lowercase: true, required: true },
    refreshToken: { type: String, required: true },
    ownerEmail: { type: String, lowercase: true, default: "system" },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  { collection: "gmailusers" }
);

GmailUserSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

export const GmailUser = mongoose.model("GmailUser", GmailUserSchema);

import mongoose from "mongoose";

export const SessionKeySchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true
  },
  userEmail: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  isUsed: {
    type: Boolean,
    required: true,
    default: false
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
  },
  createdAt: {
    type: String,
    default: () => new Date().toLocaleString('en-US', 'Asia/Kolkata'),
    required: true,
    immutable: true
  },
  usedAt: {
    type: String,
    required: false
  }
});

export const SessionKeyModel = mongoose.model('sessionkeys', SessionKeySchema);

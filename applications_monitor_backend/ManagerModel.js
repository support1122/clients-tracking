import mongoose from 'mongoose';

const managerSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  profilePhoto: {
    type: String,
    default: null // Will store Cloudinary URL
  },
  phone: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: String,
    default: () => new Date().toLocaleString('en-US', 'Asia/Kolkata')
  },
  updatedAt: {
    type: String,
    default: () => new Date().toLocaleString('en-US', 'Asia/Kolkata')
  }
});

// Update the updatedAt field before saving
managerSchema.pre('save', function(next) {
  this.updatedAt = new Date().toLocaleString('en-US', 'Asia/Kolkata');
  next();
});

// Update the updatedAt field before updating
managerSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date().toLocaleString('en-US', 'Asia/Kolkata') });
  next();
});

export const ManagerModel = mongoose.model('Manager', managerSchema, 'dashboard_managers');

// Indexes for frequent query patterns
ManagerModel.collection.createIndex({ "fullName": 1, "isActive": 1 });
ManagerModel.collection.createIndex({ "isActive": 1 });

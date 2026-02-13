import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true, default: 'onboarding_job_number' },
  lastNumber: { type: Number, required: true, default: 5799 }
});

export const OnboardingJobCounterModel = mongoose.model('OnboardingJobCounter', counterSchema);

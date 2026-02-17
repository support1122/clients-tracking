import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true, default: 'client_number' },
  lastNumber: { type: Number, required: true, default: 5808 }
});

export const ClientCounterModel = mongoose.model('ClientCounter', counterSchema);

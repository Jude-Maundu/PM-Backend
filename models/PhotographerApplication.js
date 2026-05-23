import mongoose from 'mongoose';

const photographerApplicationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  portfolio: { type: String, default: '' },        // URL to existing work
  experience: { type: String, default: '' },       // years / description
  specialization: { type: String, default: '' },   // e.g. weddings, wildlife
  equipment: { type: String, default: '' },
  message: { type: String, default: '' },          // applicant's pitch
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  reviewNotes: { type: String, default: '' },
}, { timestamps: true });

photographerApplicationSchema.index({ status: 1 });
photographerApplicationSchema.index({ createdAt: -1 });

export default mongoose.model('PhotographerApplication', photographerApplicationSchema);

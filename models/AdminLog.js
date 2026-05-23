import mongoose from 'mongoose';

const adminLogSchema = new mongoose.Schema({
  admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  adminName: { type: String, required: true },
  action: { type: String, required: true },       // e.g. 'ban_user', 'adjust_wallet'
  entityType: { type: String, default: '' },       // 'User', 'Media', 'Wallet', etc.
  entityId: { type: String, default: '' },
  details: { type: mongoose.Schema.Types.Mixed },  // before/after snapshot or description
  ip: { type: String, default: '' },
}, { timestamps: true });

adminLogSchema.index({ admin: 1 });
adminLogSchema.index({ createdAt: -1 });
adminLogSchema.index({ action: 1 });

export default mongoose.model('AdminLog', adminLogSchema);

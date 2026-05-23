import mongoose from 'mongoose';

const systemConfigSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  label: { type: String, default: '' },
  category: {
    type: String,
    enum: ['feature_flags', 'commission', 'payment', 'content', 'system'],
    default: 'system',
  },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Seed defaults if they don't exist
systemConfigSchema.statics.getOrDefault = async function (key, defaultValue) {
  const doc = await this.findOne({ key });
  return doc ? doc.value : defaultValue;
};

systemConfigSchema.statics.set = async function (key, value, adminId) {
  return this.findOneAndUpdate(
    { key },
    { value, updatedBy: adminId },
    { upsert: true, new: true }
  );
};

const SystemConfig = mongoose.model('SystemConfig', systemConfigSchema);

// Defaults seeded on first import
export async function seedDefaults() {
  const defaults = [
    { key: 'registrations_enabled',        value: true,         label: 'Allow new registrations',         category: 'feature_flags' },
    { key: 'uploads_enabled',              value: true,         label: 'Allow photo uploads',              category: 'feature_flags' },
    { key: 'purchases_enabled',            value: true,         label: 'Allow purchases',                  category: 'feature_flags' },
    { key: 'maintenance_mode',             value: false,        label: 'Maintenance mode',                 category: 'feature_flags' },
    { key: 'photo_approval_required',      value: false,        label: 'Require admin approval for photos',category: 'content'       },
    { key: 'withdrawal_approval_required', value: false,        label: 'Require admin approval for withdrawals', category: 'payment' },
    { key: 'watermark_enabled',            value: true,         label: 'Force watermark on previews',      category: 'content'       },
    { key: 'watermark_text',               value: 'PhotoMarket',label: 'Watermark text',                   category: 'content'       },
    { key: 'default_commission_rate',      value: 10,           label: 'Default platform commission (%)',  category: 'commission'    },
    { key: 'payment_mode',                 value: 'production', label: 'Payment mode (sandbox/production)',category: 'payment'       },
  ];

  for (const d of defaults) {
    const exists = await SystemConfig.findOne({ key: d.key });
    if (!exists) await SystemConfig.create(d);
  }
}

export default SystemConfig;

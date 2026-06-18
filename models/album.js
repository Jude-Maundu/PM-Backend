import mongoose from 'mongoose';

const albumSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  coverImage: { type: String, default: '' },
  coverImagePosition: {
    x: { type: Number, default: 50 },
    y: { type: Number, default: 50 },
  },

  // Pricing (0 = free or pay-per-photo only)
  price: { type: Number, default: 0 },

  // Classification
  albumType: {
    type: String,
    enum: ['event', 'personal', 'private_client'],
    default: 'personal',
  },
  eventType: {
    type: String,
    enum: ['wedding', 'graduation', 'birthday', 'marathon', 'corporate', 'concert', 'portrait', 'wildlife', 'landscape', 'street', 'fashion', 'sports', 'other'],
    default: 'other',
  },

  // Privacy
  isPrivate: { type: Boolean, default: false },
  shareToken: { type: String, default: '' }, // Token for private share link

  // Metadata
  tags: [{ type: String }],
  location: { type: String, default: '' },
  eventDate: { type: Date },
  clientName: { type: String, default: '' },

  // Relationships
  photographer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  media: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Media' }],

  // Stats
  mediaCount: { type: Number, default: 0 },
  views: { type: Number, default: 0 },
  purchasedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  // Admin approval
  isApproved: { type: Boolean, default: true },
}, { timestamps: true });

albumSchema.index({ photographer: 1, createdAt: -1 });
albumSchema.index({ createdAt: -1 });
albumSchema.index({ isPrivate: 1, isApproved: 1 });
albumSchema.index({ shareToken: 1 }, { sparse: true });
albumSchema.index({ albumType: 1 });

const Album = mongoose.model('Album', albumSchema);
export default Album;

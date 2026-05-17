import mongoose from 'mongoose';

const portfolioSchema = new mongoose.Schema({
  photographer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  username: { type: String, required: true },
  template: { type: String, enum: ['noir', 'studio', 'bold', 'lens'], default: 'noir' },
  isPublished: { type: Boolean, default: false },
  hero: {
    headline: { type: String, default: '' },
    subheadline: { type: String, default: '' },
    backgroundImage: { type: String, default: '' },
    ctaText: { type: String, default: 'View My Work' },
  },
  about: {
    bio: { type: String, default: '' },
    image: { type: String, default: '' },
  },
  featuredMediaIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Media' }],
  featuredAlbumIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Album' }],
  contact: {
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    location: { type: String, default: '' },
  },
  social: {
    instagram: { type: String, default: '' },
    twitter: { type: String, default: '' },
    facebook: { type: String, default: '' },
    website: { type: String, default: '' },
    youtube: { type: String, default: '' },
  },
  theme: {
    primaryColor: { type: String, default: '#D4AF37' },
  },
  seo: {
    title: { type: String, default: '' },
    description: { type: String, default: '' },
  },
}, { timestamps: true });

portfolioSchema.index({ photographer: 1 });
portfolioSchema.index({ username: 1 });

export default mongoose.model('Portfolio', portfolioSchema);

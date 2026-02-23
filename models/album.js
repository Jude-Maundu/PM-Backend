import mongoose from 'mongoose';

const albumSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  coverImage: { type: String }, // optional thumbnail
  photographer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

const Album = mongoose.model('Album', albumSchema);
export default Album;

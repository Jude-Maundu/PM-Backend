import mongoose from "mongoose";

const mediaSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  price: { type: Number, default: 0 },
  fileUrl: { type: String, required: true }, 
  mediaType: { type: String, enum: ["photo", "video"], required: true },
  album: { type: mongoose.Schema.Types.ObjectId, ref: "Album", default: null },
  photographer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  views: { type: Number, default: 0 },
  likes: { type: Number, default: 0 },
  downloads: { type: Number, default: 0 },
  // Track users who have purchased this media
  purchasedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  // Comments on this media
  comments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Comment" }],
  commentsCount: { type: Number, default: 0 },
  // Denormalized data for quick access
  photographerName: { type: String },
  rating: { type: Number, default: 0 },
}, { timestamps: true });

// Create indexes for common queries
mediaSchema.index({ photographer: 1, createdAt: -1 });
mediaSchema.index({ album: 1 });
mediaSchema.index({ createdAt: -1 });
mediaSchema.index({ rating: -1 });

const Media = mongoose.model("Media", mediaSchema);

export default Media;

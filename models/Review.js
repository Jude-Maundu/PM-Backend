import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema({
  reviewer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  photographer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  media: { type: mongoose.Schema.Types.ObjectId, ref: "Media" },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, maxlength: 500 },
  purchaseVerified: { type: Boolean, default: false },
}, { timestamps: true });

reviewSchema.index({ reviewer: 1, media: 1 }, { unique: true, sparse: true });
reviewSchema.index({ photographer: 1 });

export default mongoose.model("Review", reviewSchema);

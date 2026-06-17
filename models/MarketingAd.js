import mongoose from "mongoose";

const marketingAdSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  platform: { type: String, default: "meta", trim: true },
  status: {
    type: String,
    enum: ["draft", "active", "paused", "completed"],
    default: "draft",
    index: true,
  },
  budget: { type: Number, default: 0, min: 0 },
  spend: { type: Number, default: 0, min: 0 },
  ctr: { type: Number, default: 0, min: 0 },
  cpc: { type: Number, default: 0, min: 0 },
  audience: { type: String, default: "", trim: true },
  creativeNotes: { type: String, default: "", trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

marketingAdSchema.index({ createdAt: -1 });
marketingAdSchema.index({ name: "text", platform: "text", audience: "text", creativeNotes: "text" });

export default mongoose.model("MarketingAd", marketingAdSchema);

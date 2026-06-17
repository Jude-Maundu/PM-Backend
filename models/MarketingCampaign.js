import mongoose from "mongoose";

const marketingCampaignSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: "", trim: true },
  status: {
    type: String,
    enum: ["draft", "scheduled", "active", "completed", "paused"],
    default: "draft",
    index: true,
  },
  channel: { type: String, default: "multi-channel", trim: true },
  budget: { type: Number, default: 0, min: 0 },
  startDate: { type: Date, default: null },
  endDate: { type: Date, default: null },
  targetAudience: { type: String, default: "", trim: true },
  goals: { type: String, default: "", trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

marketingCampaignSchema.index({ createdAt: -1 });
marketingCampaignSchema.index({ name: "text", description: "text", channel: "text", targetAudience: "text", goals: "text" });

export default mongoose.model("MarketingCampaign", marketingCampaignSchema);

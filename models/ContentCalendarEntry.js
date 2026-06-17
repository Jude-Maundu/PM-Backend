import mongoose from "mongoose";

const contentCalendarEntrySchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: "", trim: true },
  contentType: {
    type: String,
    enum: ["banner", "email", "social", "blog", "push"],
    default: "banner",
    index: true,
  },
  status: {
    type: String,
    enum: ["idea", "draft", "scheduled", "published"],
    default: "idea",
    index: true,
  },
  publishDate: { type: Date, default: null },
  channel: { type: String, default: "homepage", trim: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  assetUrl: { type: String, default: "", trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

contentCalendarEntrySchema.index({ createdAt: -1 });
contentCalendarEntrySchema.index({ title: "text", description: "text", channel: "text" });

export default mongoose.model("ContentCalendarEntry", contentCalendarEntrySchema);

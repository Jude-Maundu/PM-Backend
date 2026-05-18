import mongoose from "mongoose";

const proofingSchema = new mongoose.Schema({
  photographer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, required: true },
  clientName: { type: String, default: "" },
  clientEmail: { type: String, default: "" },
  token: { type: String, unique: true },
  mediaIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Media" }],
  approvals: [{
    mediaId: { type: mongoose.Schema.Types.ObjectId, ref: "Media" },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    note: { type: String, default: "" },
  }],
  isActive: { type: Boolean, default: true },
  expiresAt: { type: Date },
  message: { type: String, default: "" },
}, { timestamps: true });

export default mongoose.model("ProofingGallery", proofingSchema);

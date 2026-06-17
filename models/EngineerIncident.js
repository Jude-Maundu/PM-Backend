import mongoose from "mongoose";

const engineerIncidentSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: "", trim: true },
  severity: {
    type: String,
    enum: ["low", "medium", "high", "critical"],
    default: "medium",
    index: true,
  },
  status: {
    type: String,
    enum: ["open", "investigating", "resolved"],
    default: "open",
    index: true,
  },
  service: { type: String, default: "platform", trim: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  startedAt: { type: Date, default: Date.now },
  resolvedAt: { type: Date, default: null },
  rootCause: { type: String, default: "", trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

engineerIncidentSchema.index({ createdAt: -1 });
engineerIncidentSchema.index({ title: "text", description: "text", service: "text", rootCause: "text" });

export default mongoose.model("EngineerIncident", engineerIncidentSchema);

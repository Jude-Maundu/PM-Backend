import mongoose from "mongoose";

const deploymentRecordSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  environment: { type: String, default: "production", trim: true },
  version: { type: String, default: "", trim: true },
  status: {
    type: String,
    enum: ["scheduled", "running", "successful", "failed", "rolled_back"],
    default: "scheduled",
    index: true,
  },
  releaseNotes: { type: String, default: "", trim: true },
  deployedAt: { type: Date, default: null },
  rollbackAvailable: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

deploymentRecordSchema.index({ createdAt: -1 });
deploymentRecordSchema.index({ title: "text", version: "text", environment: "text", releaseNotes: "text" });

export default mongoose.model("DeploymentRecord", deploymentRecordSchema);

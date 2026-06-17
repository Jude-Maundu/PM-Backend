import mongoose from "mongoose";

const backupRunSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  environment: { type: String, default: "production", trim: true },
  backupType: {
    type: String,
    enum: ["database", "media", "full"],
    default: "database",
    index: true,
  },
  status: {
    type: String,
    enum: ["scheduled", "running", "completed", "failed"],
    default: "scheduled",
    index: true,
  },
  storageProvider: { type: String, default: "local", trim: true },
  restorePoint: { type: String, default: "", trim: true },
  notes: { type: String, default: "", trim: true },
  executedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

backupRunSchema.index({ createdAt: -1 });
backupRunSchema.index({ name: "text", environment: "text", restorePoint: "text", notes: "text" });

export default mongoose.model("BackupRun", backupRunSchema);

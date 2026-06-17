import mongoose from "mongoose";

const staffTaskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: "", trim: true },
  status: {
    type: String,
    enum: ["todo", "in_progress", "done", "blocked"],
    default: "todo",
    index: true,
  },
  priority: {
    type: String,
    enum: ["low", "medium", "high"],
    default: "medium",
    index: true,
  },
  taskType: { type: String, default: "operations", trim: true },
  dueDate: { type: Date, default: null },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  completionNotes: { type: String, default: "", trim: true },
}, { timestamps: true });

staffTaskSchema.index({ createdAt: -1 });
staffTaskSchema.index({ title: "text", description: "text", taskType: "text" });

export default mongoose.model("StaffTask", staffTaskSchema);

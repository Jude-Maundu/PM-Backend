import mongoose from "mongoose";

const supportTicketSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: "", trim: true },
  status: {
    type: String,
    enum: ["open", "pending", "closed", "escalated"],
    default: "open",
    index: true,
  },
  priority: {
    type: String,
    enum: ["low", "medium", "high", "critical"],
    default: "medium",
    index: true,
  },
  requesterName: { type: String, default: "", trim: true },
  requesterEmail: { type: String, default: "", trim: true },
  category: { type: String, default: "general", trim: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  dueDate: { type: Date, default: null },
  resolutionNotes: { type: String, default: "", trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

supportTicketSchema.index({ createdAt: -1 });
supportTicketSchema.index({ title: "text", description: "text", requesterName: "text", requesterEmail: "text", category: "text" });

export default mongoose.model("SupportTicket", supportTicketSchema);

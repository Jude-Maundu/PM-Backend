import mongoose from "mongoose";

const mpesaRetrySchema = new mongoose.Schema({
  payment: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Payment"
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  type: { 
    type: String, 
    enum: ["photographer", "admin"], 
    required: true 
  },
  phoneNumber: { type: String, required: true },
  amount: { type: Number, required: true },
  reference: String,
  description: String,
  attemptCount: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now },
  maxAttempts: { type: Number, default: 5 },
  status: { 
    type: String, 
    enum: ["pending", "processing", "success", "failed"], 
    default: "pending"
  },
  lastError: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

// Indexes for common queries
mpesaRetrySchema.index({ status: 1, nextAttemptAt: 1 });
mpesaRetrySchema.index({ createdAt: -1 });

const MpesaRetry = mongoose.model("MpesaRetry", mpesaRetrySchema);
export default MpesaRetry;

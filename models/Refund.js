import mongoose from "mongoose";

const refundSchema = new mongoose.Schema({
  payment: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Payment", 
    required: true,
    index: true
  },
  buyer: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true,
    index: true
  },
  media: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Media", 
    required: false
  },
  album: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Album",
    required: false
  },
  amount: { type: Number, required: true },
  reason: String,
  status: { 
    type: String, 
    enum: ["pending", "approved", "rejected", "processed"], 
    default: "pending",
    index: true
  },
  refundAmount: { type: Number, default: 0 },
  adminRejectionReason: String,
  receipt: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Receipt"
  }
}, { timestamps: true });

// Indexes for common queries
refundSchema.index({ buyer: 1, createdAt: -1 });
refundSchema.index({ status: 1 });

const Refund = mongoose.model("Refund", refundSchema);
export default Refund;

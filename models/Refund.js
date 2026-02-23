import mongoose from "mongoose";

const refundSchema = new mongoose.Schema({
  payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", required: true },
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  media: { type: mongoose.Schema.Types.ObjectId, ref: "Media", required: true },
  amount: { type: Number, required: true },
  reason: String,
  status: { type: String, enum: ["pending", "approved", "rejected", "processed"], default: "pending" },
  refundAmount: { type: Number, default: 0 },
  adminRejectionReason: String,
}, { timestamps: true });

const Refund = mongoose.model("Refund", refundSchema);
export default Refund;

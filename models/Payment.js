import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  media: { type: mongoose.Schema.Types.ObjectId, ref: "Media", required: true },
  amount: { type: Number, required: true },
  adminShare: { type: Number, required: true },
  photographerShare: { type: Number, required: true },
  status: { type: String, enum: ["pending", "completed", "failed"], default: "pending" },
  paymentMethod: { type: String, enum: ["mpesa", "mock"], default: "mock" },
  checkoutRequestID: { type: String }, // from Daraja for tracking
}, { timestamps: true });

const Payment = mongoose.model("Payment", paymentSchema);
export default Payment;

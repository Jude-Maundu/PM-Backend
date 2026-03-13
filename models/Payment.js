import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  media: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Media",
    required: false
  },
  amount: {
    type: Number,
    required: true
  },
  adminShare: {
    type: Number,
    default: 0
  },
  photographerShare: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ["pending", "completed", "failed", "refunded"],
    default: "pending"
  },
  paymentMethod: {
    type: String,
    enum: ["mpesa", "mock"],
    default: "mpesa"
  },
  checkoutRequestID: String,
  merchantRequestID: String,
  mpesaReceiptNumber: String,
  phoneNumber: String,
  transactionDate: Date,
  callbackData: mongoose.Schema.Types.Mixed
}, { timestamps: true });

const Payment = mongoose.model("Payment", paymentSchema);
export default Payment;
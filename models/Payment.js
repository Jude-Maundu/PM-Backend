import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  photographer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: false
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
  cartItems: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Media"
  }],
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
    default: "pending",
    index: true
  },
  paymentMethod: {
    type: String,
    enum: ["mpesa", "mock"],
    default: "mpesa"
  },
  checkoutRequestID: String,
  merchantRequestID: String,
  mpesaReceiptNumber: String,
  transactionId: String,
  phoneNumber: String,
  transactionDate: Date,
  callbackData: mongoose.Schema.Types.Mixed,
  // Link to receipt for tracking
  receipt: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Receipt"
  },
  // Link to wallet top-up if applicable
  walletTopup: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

// Indexes for common queries
paymentSchema.index({ buyer: 1, createdAt: -1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ checkoutRequestID: 1 });

const Payment = mongoose.model("Payment", paymentSchema);
export default Payment;
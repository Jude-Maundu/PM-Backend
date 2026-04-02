import mongoose from "mongoose";

const walletTransactionSchema = new mongoose.Schema({
  wallet: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Wallet",
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  type: {
    type: String,
    enum: ["credit", "debit", "refund", "topup"],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  description: String,
  // Reference to related payment or refund
  payment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Payment"
  },
  refund: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Refund"
  },
  // Reference to photographer who received the payment
  photographer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  // Media or Album sold
  media: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Media"
  },
  album: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Album"
  },
  balanceAfter: {
    type: Number
  },
  status: {
    type: String,
    enum: ["pending", "completed", "failed"],
    default: "completed",
    index: true
  }
}, { timestamps: true });

// Indexes for common queries
walletTransactionSchema.index({ wallet: 1, createdAt: -1 });
walletTransactionSchema.index({ user: 1, createdAt: -1 });
walletTransactionSchema.index({ type: 1, createdAt: -1 });
walletTransactionSchema.index({ status: 1 });

const WalletTransaction = mongoose.model("WalletTransaction", walletTransactionSchema);
export default WalletTransaction;

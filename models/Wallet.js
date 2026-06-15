import mongoose from "mongoose";

const walletSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  balance: {
    type: Number,
    default: 0,
    min: 0
  },
  totalReceived: {
    type: Number,
    default: 0
  },
  totalWithdrawn: {
    type: Number,
    default: 0
  },
  // Embedded transaction history
  transactions: [{
    type:        { type: String, enum: ["credit", "debit", "refund", "topup"], required: true },
    amount:      { type: Number, required: true },
    description: { type: String },
    reference:   { type: String },
    createdAt:   { type: Date, default: Date.now },
  }]
}, { timestamps: true });

// Schema-level indexes
walletSchema.index({ user: 1 }, { unique: true });

const Wallet = mongoose.model("Wallet", walletSchema);
export default Wallet;

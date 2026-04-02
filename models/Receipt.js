import mongoose from "mongoose";

const receiptSchema = new mongoose.Schema({
  buyer: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true
  },
  payment: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Payment", 
    required: true
  },
  items: [
    {
      media: { type: mongoose.Schema.Types.ObjectId, ref: "Media" },
      album: { type: mongoose.Schema.Types.ObjectId, ref: "Album" },
      title: String,
      price: Number,
      photographer: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
    }
  ],
  totalAmount: { type: Number, required: true },
  adminShare: { type: Number, required: true },
  method: { type: String, enum: ["mpesa", "mock", "card"], default: "mpesa" },
  transactionId: { type: String },
  downloadUrl: String, // signed URL for download
  receiptNumber: { type: String },
  status: { type: String, enum: ["completed", "refunded", "pending"], default: "completed" }
}, { timestamps: true });

// Indexes for common queries
receiptSchema.index({ buyer: 1, createdAt: -1 });
receiptSchema.index({ status: 1 });

const Receipt = mongoose.model("Receipt", receiptSchema);
export default Receipt;

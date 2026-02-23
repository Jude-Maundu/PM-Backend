import mongoose from "mongoose";

const receiptSchema = new mongoose.Schema({
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", required: true },
  items: [
    {
      media: { type: mongoose.Schema.Types.ObjectId, ref: "Media" },
      title: String,
      price: Number,
      photographer: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
    }
  ],
  totalAmount: { type: Number, required: true },
  adminShare: { type: Number, required: true },
  transactionId: String,
  downloadUrl: String, // signed URL for download
  receiptNumber: { type: String, unique: true },
  status: { type: String, enum: ["completed", "refunded", "pending"], default: "completed" }
}, { timestamps: true });

const Receipt = mongoose.model("Receipt", receiptSchema);
export default Receipt;

import mongoose from "mongoose";

const mpesaLogSchema = new mongoose.Schema({
  eventType: { 
    type: String, 
    enum: ["request", "response", "callback", "b2c", "error"], 
    required: true,
    index: true
  },
  source: { 
    type: String, 
    enum: ["payWithMpesa", "mpesaCallback", "sendMoneyToPhotographer", "retryWorker"], 
    default: "payWithMpesa",
    index: true
  },
  payment: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Payment",
    index: true
  },
  transactionId: { type: String, index: true },
  merchantRequestID: String,
  checkoutRequestID: { type: String, index: true },
  phoneNumber: String,
  amount: Number,
  data: mongoose.Schema.Types.Mixed,
  error: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

// Index for timestamp queries
mpesaLogSchema.index({ createdAt: -1 });
mpesaLogSchema.index({ eventType: 1, createdAt: -1 });

const MpesaLog = mongoose.model("MpesaLog", mpesaLogSchema);
export default MpesaLog;

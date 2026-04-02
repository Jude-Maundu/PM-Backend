import mongoose from "mongoose";

const mpesaLogSchema = new mongoose.Schema({
  eventType: { 
    type: String, 
    enum: ["request", "response", "callback", "b2c", "error"], 
    required: true
  },
  source: { 
    type: String, 
    enum: ["payWithMpesa", "mpesaCallback", "sendMoneyToPhotographer", "retryWorker"], 
    default: "payWithMpesa"
  },
  payment: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Payment"
  },
  transactionId: { type: String },
  merchantRequestID: String,
  checkoutRequestID: { type: String },
  phoneNumber: String,
  amount: Number,
  data: mongoose.Schema.Types.Mixed,
  error: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

// Schema-level indexes
mpesaLogSchema.index({ createdAt: -1 });
mpesaLogSchema.index({ eventType: 1, createdAt: -1 });
mpesaLogSchema.index({ source: 1 });
mpesaLogSchema.index({ payment: 1 });
mpesaLogSchema.index({ transactionId: 1 });
mpesaLogSchema.index({ checkoutRequestID: 1 });

const MpesaLog = mongoose.model("MpesaLog", mpesaLogSchema);
export default MpesaLog;

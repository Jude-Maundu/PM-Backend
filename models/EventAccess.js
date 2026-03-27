import mongoose from "mongoose";

const eventAccessSchema = new mongoose.Schema({
  album: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Album",
    required: true,
    index: true
  },
  photographer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  token: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, { timestamps: true });

// Auto-delete expired tokens
eventAccessSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const EventAccess = mongoose.model("EventAccess", eventAccessSchema);
export default EventAccess;

import mongoose from "mongoose";

const eventAccessSchema = new mongoose.Schema({
  album: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Album",
    required: true
  },
  photographer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  token: {
    type: String,
    required: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

// Schema-level indexes
eventAccessSchema.index({ album: 1 });
eventAccessSchema.index({ photographer: 1 });
eventAccessSchema.index({ buyer: 1 });
eventAccessSchema.index({ token: 1 }, { unique: true });
eventAccessSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
eventAccessSchema.index({ isActive: 1 });

const EventAccess = mongoose.model("EventAccess", eventAccessSchema);
export default EventAccess;

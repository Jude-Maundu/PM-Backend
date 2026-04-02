import mongoose from "mongoose";

const shareTokenSchema = new mongoose.Schema({
  // Core share information - can share either media or album
  media: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Media"
  },
  album: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Album"
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  
  // Token & Sharing
  token: {
    type: String,
    required: true
  },
  shareUrl: {
    type: String,
    required: true
  },
  qrCodePath: {
    type: String,
    default: null
  },
  
  // Expiration & Limits
  expiresAt: {
    type: Date,
    required: true
  },
  maxDownloads: {
    type: Number,
    default: 10,
    min: 1
  },
  downloadCount: {
    type: Number,
    default: 0,
    min: 0
  },
  accessCount: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  revokedAt: {
    type: Date,
    default: null
  },
  
  // Analytics
  accessLog: [
    {
      timestamp: {
        type: Date,
        default: Date.now
      },
      ip: String,
      userAgent: String,
      action: {
        type: String,
        enum: ["view", "download"],
        default: "view"
      },
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
      }
    }
  ],
  
  // Metadata
  description: String,
  customMessage: String,
  
  // Tracking who the share was sent to
  sentTo: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      },
      sentAt: {
        type: Date,
        default: Date.now
      }
    }
  ]
}, { timestamps: true });

// Schema-level indexes
shareTokenSchema.index({ createdBy: 1 });
shareTokenSchema.index({ token: 1 }, { unique: true });
shareTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
shareTokenSchema.index({ isActive: 1 });
shareTokenSchema.index({ createdBy: 1, createdAt: -1 });

const ShareToken = mongoose.model("ShareToken", shareTokenSchema);
export default ShareToken;

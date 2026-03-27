import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["share", "purchase", "payment", "admin", "system"],
      default: "share",
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: String,
    data: {
      mediaId: mongoose.Schema.Types.ObjectId,
      shareToken: String,
      paymentId: String,
      orderId: String,
      albumId: String,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: Date,
    actionUrl: String, // URL to navigate to (e.g., /share/token)
    actionLabel: String, // Button text (e.g., "View Media")
    priority: {
      type: String,
      enum: ["low", "normal", "high"],
      default: "normal",
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

// TTL index: auto-delete read notifications after 30 days
notificationSchema.index(
  { readAt: 1 },
  { expireAfterSeconds: 2592000, partialFilterExpression: { isRead: true } }
);

// Index for common queries
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, isRead: 1 });

export default mongoose.model("Notification", notificationSchema);

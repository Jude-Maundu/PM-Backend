import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  // Message content
  text: { type: String, required: true },
  
  // Conversation & participants
  conversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Conversation",
    required: true,
    index: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  
  // Media attachments (images, files, etc.)
  attachments: [
    {
      type: String, // URL or file path
      fileType: String, // image, video, file, etc.
      fileName: String,
      fileSize: Number
    }
  ],
  
  // Message status tracking
  readBy: [
    {
      userId: mongoose.Schema.Types.ObjectId,
      readAt: { type: Date, default: Date.now }
    }
  ],
  isRead: { type: Boolean, default: false },
  readAt: Date,
  
  // Message metadata
  isEdited: { type: Boolean, default: false },
  editedAt: Date,
  editHistory: [
    {
      text: String,
      editedAt: Date
    }
  ],
  
  // Reactions (like Instagram)
  reactions: {
    type: Map,
    of: [mongoose.Schema.Types.ObjectId], // Array of user IDs who reacted
    default: new Map()
  },
  
  // Reply to another message (threading)
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Message",
    default: null
  },
  
  // Forwarded from another message
  forwardedFrom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Message",
    default: null
  },
  
  // Message type
  type: {
    type: String,
    enum: ["text", "image", "video", "file", "system"],
    default: "text"
  },
  
  // System message info (e.g., "User joined conversation")
  systemInfo: {
    action: String, // "joined", "left", "mediaShared", etc.
    actionBy: mongoose.Schema.Types.ObjectId, // Who initiated
    details: mongoose.Schema.Types.Mixed
  },
  
  // Deleted message
  isDeleted: { type: Boolean, default: false },
  deletedAt: Date,
  deletedBy: mongoose.Schema.Types.ObjectId
  
}, { timestamps: true });

// Indexes for fast queries
messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });
messageSchema.index({ conversation: 1, isRead: 1 });
messageSchema.index({ replyTo: 1 });

const Message = mongoose.model("Message", messageSchema);
export default Message;

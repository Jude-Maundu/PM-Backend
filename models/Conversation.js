import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema({
  // Participants - could be 1-1 or group (we'll start with 1-1)
  participants: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    }
  ],
  
  // Conversation metadata
  name: String, // For group chats later
  isGroup: { type: Boolean, default: false },
  
  // Last message info for quick display
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Message"
  },
  lastMessageAt: { type: Date, default: Date.now },
  lastMessageText: String, // Denormalized for quick access
  lastMessageSenderId: mongoose.Schema.Types.ObjectId,
  
  // Unread count per participant
  unreadCounts: {
    type: Map,
    of: Number,
    default: new Map()
  },
  
  // Track if conversation is archived/muted
  archivedBy: [mongoose.Schema.Types.ObjectId],
  mutedBy: [mongoose.Schema.Types.ObjectId],
  
  // Pinned messages
  pinnedMessages: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message"
    }
  ]
}, { timestamps: true });

// Indexes for fast queries
conversationSchema.index({ participants: 1 });
conversationSchema.index({ lastMessageAt: -1 });
conversationSchema.index({ participants: 1, lastMessageAt: -1 });

// Create unique index for 1-1 conversations (pairs sorted alphabetically)
conversationSchema.pre('save', async function(next) {
  if (!this.isGroup && this.participants.length === 2) {
    // Sort participant IDs for consistent unique index
    const sorted = this.participants.map(p => p.toString()).sort();
    
    // Check if conversation already exists
    const existing = await mongoose.model('Conversation').findOne({
      isGroup: false,
      participants: { $all: this.participants }
    });
    
    if (existing && existing._id.toString() !== this._id.toString()) {
      throw new Error('Conversation with these participants already exists');
    }
  }
  next();
});

const Conversation = mongoose.model("Conversation", conversationSchema);
export default Conversation;

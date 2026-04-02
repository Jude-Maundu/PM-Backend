import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/users.js";
import { emitToConversation, emitToUser } from "../services/socketService.js";

// ==================== CONVERSATION ENDPOINTS ====================

export async function getConversations(req, res) {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const conversations = await Conversation.find({
      participants: userId,
      archivedBy: { $ne: userId }
    })
      .populate("participants", "username profilePicture email")
      .populate("lastMessage")
      .sort({ lastMessageAt: -1 })
      .limit(50);

    res.status(200).json(conversations);
  } catch (error) {
    console.error("[getConversations] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function getConversationWithUser(req, res) {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?._id;
    const { otherUserId } = req.params;

    if (!userId || !otherUserId) {
      return res.status(400).json({ message: "User ID required" });
    }

    if (userId === otherUserId) {
      return res.status(400).json({ message: "Cannot start conversation with yourself" });
    }

    const otherUser = await User.findById(otherUserId);
    if (!otherUser) {
      return res.status(404).json({ message: "Other user not found" });
    }

    const currentUser = await User.findById(userId);
    if (!currentUser) {
      return res.status(404).json({ message: "Authenticated user not found" });
    }

    // Find or create 1-1 conversation
    let conversation = await Conversation.findOne({
      isGroup: false,
      participants: { $all: [userId, otherUserId] }
    }).populate("participants", "username profilePicture email");

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [userId, otherUserId],
        isGroup: false,
        unreadCounts: new Map()
      });
      await conversation.populate("participants", "username profilePicture email");
    }

    res.status(200).json(conversation);
  } catch (error) {
    console.error("[getConversationWithUser] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function sendMessage(req, res) {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?._id;
    const { conversationId, text, replyTo } = req.body;

    if (!userId || !conversationId || !text) {
      return res.status(400).json({ message: "User ID, conversation ID, and text are required" });
    }

    // Verify user is participant
    const conversation = await Conversation.findById(conversationId);
    const isParticipant = conversation?.participants?.some(
      (participant) => participant.toString() === userId.toString()
    );
    if (!conversation || !isParticipant) {
      return res.status(403).json({ message: "Not a participant in this conversation" });
    }

    // Create message
    const message = await Message.create({
      text,
      conversation: conversationId,
      sender: userId,
      replyTo: replyTo || null
    });

    // Populate sender info
    await message.populate("sender", "username profilePicture");

    // Update conversation's last message
    conversation.lastMessage = message._id;
    conversation.lastMessageAt = new Date();
    conversation.lastMessageText = text.substring(0, 100);
    conversation.lastMessageSenderId = userId;

    // Reset unread count for sender, increment for others
    const unreadCounts = new Map(conversation.unreadCounts || []);
    conversation.participants.forEach(participantId => {
      if (participantId.toString() !== userId.toString()) {
        unreadCounts.set(participantId.toString(), (unreadCounts.get(participantId.toString()) || 0) + 1);
      } else {
        unreadCounts.set(userId.toString(), 0);
      }
    });
    conversation.unreadCounts = unreadCounts;

    await conversation.save();

    // Emit real-time event to conversation participants
    emitToConversation(conversationId, "new_message", { message, conversationId });

    res.status(201).json(message);
  } catch (error) {
    console.error("[sendMessage] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function getMessages(req, res) {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?._id;
    const { conversationId } = req.params;
    const { limit = 50, skip = 0 } = req.query;

    if (!userId || !conversationId) {
      return res.status(400).json({ message: "User ID and conversation ID required" });
    }

    // Verify user is participant
    const conversation = await Conversation.findById(conversationId);
    const isParticipant = conversation?.participants?.some(
      (participant) => participant.toString() === userId.toString()
    );
    if (!conversation || !isParticipant) {
      return res.status(403).json({ message: "Not a participant in this conversation" });
    }

    // Get messages
    const messages = await Message.find({ conversation: conversationId })
      .populate("sender", "username profilePicture")
      .populate("replyTo")
      .sort({ createdAt: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .lean();

    // Mark as read
    await Message.updateMany(
      { conversation: conversationId, 'readBy.userId': { $ne: userId } },
      { 
        $push: { readBy: { userId, readAt: new Date() } },
        $set: { isRead: true }
      }
    );

    // Reset unread count for this user
    conversation.unreadCounts.set(userId.toString(), 0);
    await conversation.save();

    res.status(200).json(messages.reverse());
  } catch (error) {
    console.error("[getMessages] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function editMessage(req, res) {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?._id;
    const { messageId } = req.params;
    const { text } = req.body;

    if (!userId || !messageId || !text) {
      return res.status(400).json({ message: "User ID, message ID, and text are required" });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    // Verify ownership
    if (message.sender.toString() !== userId.toString()) {
      return res.status(403).json({ message: "You can only edit your own messages" });
    }

    // Save edit history
    message.editHistory = message.editHistory || [];
    message.editHistory.push({
      text: message.text,
      editedAt: message.updatedAt
    });

    message.text = text;
    message.isEdited = true;
    message.editedAt = new Date();
    await message.save();

    await message.populate("sender", "username profilePicture");

    const conversationId = message.conversation?.toString() || req.params.conversationId;
    if (conversationId) {
      emitToConversation(conversationId, "message_edited", {
        messageId: message._id,
        text: message.text,
        editedAt: message.editedAt,
        editHistory: message.editHistory,
      });
    }

    res.status(200).json(message);
  } catch (error) {
    console.error("[editMessage] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function deleteMessage(req, res) {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?._id;
    const { messageId } = req.params;
    const { hard = false } = req.query; // hard delete or soft delete

    if (!userId || !messageId) {
      return res.status(400).json({ message: "User ID and message ID are required" });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    // Verify ownership
    if (message.sender.toString() !== userId.toString()) {
      return res.status(403).json({ message: "You can only delete your own messages" });
    }

    const conversationId = message.conversation?.toString();
    if (conversationId) {
      emitToConversation(conversationId, "message_deleted", { messageId: message._id });
    }

    if (hard === 'true') {
      // Hard delete
      await Message.findByIdAndDelete(messageId);
      res.status(200).json({ message: "Message deleted permanently" });
    } else {
      // Soft delete
      message.isDeleted = true;
      message.deletedAt = new Date();
      message.deletedBy = userId;
      message.text = "[Message deleted]";
      await message.save();
      res.status(200).json({ message: "Message deleted" });
    }
  } catch (error) {
    console.error("[deleteMessage] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function addReaction(req, res) {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?._id;
    const { messageId } = req.params;
    const { emoji } = req.body;

    if (!userId || !messageId || !emoji) {
      return res.status(400).json({ message: "User ID, message ID, and emoji are required" });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    // Initialize reactions if not exist
    if (!message.reactions) {
      message.reactions = new Map();
    }

    const emojiReactions = message.reactions.get(emoji) || [];
    if (!emojiReactions.includes(userId)) {
      emojiReactions.push(userId);
      message.reactions.set(emoji, emojiReactions);
      await message.save();
    }

    const convId = message.conversation?.toString();
    if (convId) {
      emitToConversation(convId, "reaction_added", { messageId: message._id, emoji, userId });
    }

    res.status(200).json(message);
  } catch (error) {
    console.error("[addReaction] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function removeReaction(req, res) {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?._id;
    const { messageId } = req.params;
    const { emoji } = req.body;

    if (!userId || !messageId || !emoji) {
      return res.status(400).json({ message: "User ID, message ID, and emoji are required" });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    if (message.reactions && message.reactions.has(emoji)) {
      let emojiReactions = message.reactions.get(emoji) || [];
      emojiReactions = emojiReactions.filter(id => id.toString() !== userId.toString());
      
      if (emojiReactions.length > 0) {
        message.reactions.set(emoji, emojiReactions);
      } else {
        message.reactions.delete(emoji);
      }
      await message.save();
    }

    res.status(200).json(message);
  } catch (error) {
    console.error("[removeReaction] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function markAsRead(req, res) {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?._id;
    const { conversationId } = req.params;

    if (!userId || !conversationId) {
      return res.status(400).json({ message: "User ID and conversation ID required" });
    }

    // Mark all messages in conversation as read for this user
    await Message.updateMany(
      { 
        conversation: conversationId,
        'readBy.userId': { $ne: userId }
      },
      { 
        $push: { readBy: { userId, readAt: new Date() } },
        $set: { isRead: true }
      }
    );

    // Reset unread count
    const conversation = await Conversation.findById(conversationId);
    if (conversation) {
      conversation.unreadCounts.set(userId.toString(), 0);
      await conversation.save();
    }

    res.status(200).json({ message: "Marked as read" });
  } catch (error) {
    console.error("[markAsRead] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function archiveConversation(req, res) {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?._id;
    const { conversationId } = req.params;

    if (!userId || !conversationId) {
      return res.status(400).json({ message: "User ID and conversation ID required" });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const isArchived = conversation.archivedBy.some(
      (archivedUserId) => archivedUserId.toString() === userId.toString()
    );
    if (!isArchived) {
      conversation.archivedBy.push(userId);
      await conversation.save();
    }

    res.status(200).json({ message: "Conversation archived" });
  } catch (error) {
    console.error("[archiveConversation] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function unarchiveConversation(req, res) {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?._id;
    const { conversationId } = req.params;

    if (!userId || !conversationId) {
      return res.status(400).json({ message: "User ID and conversation ID required" });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    conversation.archivedBy = conversation.archivedBy.filter(id => id.toString() !== userId.toString());
    await conversation.save();

    res.status(200).json({ message: "Conversation unarchived" });
  } catch (error) {
    console.error("[unarchiveConversation] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

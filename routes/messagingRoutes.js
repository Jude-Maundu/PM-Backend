import express from "express";
import { authenticate } from "../middlewares/auth.js";
import {
  getConversations,
  getConversationWithUser,
  sendMessage,
  getMessages,
  editMessage,
  deleteMessage,
  addReaction,
  removeReaction,
  markAsRead,
  archiveConversation,
  unarchiveConversation
} from "../controllers/messagingController.js";

const router = express.Router();

// ==================== CONVERSATION ROUTES ====================

// Get all conversations for authenticated user
router.get("/conversations", authenticate, getConversations);

// Get or create 1-1 conversation with another user
router.get("/conversations/:otherUserId", authenticate, getConversationWithUser);

// Mark conversation as read
router.put("/conversations/:conversationId/read", authenticate, markAsRead);

// Archive conversation
router.post("/conversations/:conversationId/archive", authenticate, archiveConversation);

// Unarchive conversation
router.post("/conversations/:conversationId/unarchive", authenticate, unarchiveConversation);

// ==================== MESSAGE ROUTES ====================

// Get messages in a conversation (with pagination)
router.get("/conversations/:conversationId/messages", authenticate, getMessages);

// Send message
router.post("/", authenticate, sendMessage);

// Edit message
router.put("/:messageId", authenticate, editMessage);

// Delete message
router.delete("/:messageId", authenticate, deleteMessage);

// Add reaction to message
router.post("/:messageId/reactions", authenticate, addReaction);

// Remove reaction from message
router.delete("/:messageId/reactions", authenticate, removeReaction);

export default router;

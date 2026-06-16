import express from "express";
import { authenticate } from "../middlewares/auth.js";
import { requireAdmin } from "../middlewares/admin.js";
import { requireStaff } from "../middlewares/staff.js";
import {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  sendShareToUsers,
  searchUsers,
  adminGetAllShares,
  adminGetNotificationStats,
  broadcastNotification,
  getBroadcastHistory,
  updateBroadcastHistoryItem,
  deleteBroadcastHistoryItem,
} from "../controllers/notificationController.js";

const router = express.Router();

// ============ USER NOTIFICATIONS ============

// Get user's notifications
router.get("/", authenticate, getNotifications);

// Mark single notification as read
router.patch("/:id/read", authenticate, markNotificationAsRead);

// Mark all notifications as read
router.patch("/read/all", authenticate, markAllNotificationsAsRead);

// Delete notification
router.delete("/:id", authenticate, deleteNotification);

// ============ SHARE NOTIFICATIONS ============

// Search users for share recipient selection
router.get("/share/search-recipients", authenticate, searchUsers);

// Send share link to specific user(s)
router.post("/share/send", authenticate, sendShareToUsers);

// ============ ADMIN / STAFF ENDPOINTS ============

// Broadcast a notification to a user group (all staff roles)
router.post("/admin/broadcast", authenticate, requireStaff, broadcastNotification);

// Get broadcast history (all staff roles)
router.get("/admin/broadcast/history", authenticate, requireStaff, getBroadcastHistory);
router.patch("/admin/broadcast/history", authenticate, requireStaff, updateBroadcastHistoryItem);
router.delete("/admin/broadcast/history", authenticate, requireStaff, deleteBroadcastHistoryItem);

// Get all shares (admin only)
router.get("/admin/shares", authenticate, requireAdmin, adminGetAllShares);

// Get notification statistics (admin only)
router.get("/admin/stats", authenticate, requireAdmin, adminGetNotificationStats);

export default router;

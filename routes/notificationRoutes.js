import express from "express";
import { authenticate } from "../middlewares/auth.js";
import { requireAdmin } from "../middlewares/admin.js";
import {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  sendShareToUsers,
  searchUsers,
  adminGetAllShares,
  adminGetNotificationStats,
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

// ============ ADMIN ENDPOINTS ============

// Get all shares (admin only)
router.get("/admin/shares", authenticate, requireAdmin, adminGetAllShares);

// Get notification statistics (admin only)
router.get("/admin/stats", authenticate, requireAdmin, adminGetNotificationStats);

export default router;

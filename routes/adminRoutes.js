import express from "express";
import { authenticate } from "../middlewares/auth.js";
import { requireAdmin } from "../middlewares/admin.js";
import {
  getAllMediaAdmin,
  getAllAlbumsAdmin,
  getMediaDetailsAdmin,
  getAlbumDetailsAdmin,
  deleteMediaAdmin,
  deleteAlbumAdmin,
  getPlatformStatsAdmin
} from "../controllers/adminController.js";

const router = express.Router();

// All admin routes require authentication and admin role
router.use(authenticate, requireAdmin);

// ==================== CONTENT MANAGEMENT ====================

// Get all media with filters
router.get("/media", getAllMediaAdmin);

// Get all albums with filters
router.get("/albums", getAllAlbumsAdmin);

// Get detailed info about specific media + sales data
router.get("/media/:mediaId/details", getMediaDetailsAdmin);

// Get detailed info about specific album + sales data
router.get("/albums/:albumId/details", getAlbumDetailsAdmin);

// Delete media
router.delete("/media/:mediaId", deleteMediaAdmin);

// Delete album
router.delete("/albums/:albumId", deleteAlbumAdmin);

// ==================== STATISTICS & ANALYTICS ====================

// Get platform-wide statistics
router.get("/stats/overview", getPlatformStatsAdmin);

export default router;

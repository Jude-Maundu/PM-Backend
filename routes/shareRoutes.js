import express from "express";
import {
  generateShareLink,
  accessSharedMedia,
  downloadViaShareLink,
  revokeShareLink,
  listActiveShares,
  getShareStats,
  shareAlbumWithBuyer,
  purchaseViaShare,
  checkGuestPaymentStatus,
  guestBuyPublicAlbum,
  checkDirectGuestStatus
} from "../controllers/shareController.js";
import { authenticate } from "../middlewares/auth.js";

const router = express.Router();

// Protected routes require authentication
router.post("/generate", authenticate, generateShareLink);
router.post("/album/:albumId/share", authenticate, shareAlbumWithBuyer);
router.get("/list", authenticate, listActiveShares);
router.get("/:token/stats", authenticate, getShareStats);
router.delete("/:token/revoke", authenticate, revokeShareLink);

// Public routes - no auth required
router.post("/guest-buy", guestBuyPublicAlbum);
router.get("/guest-status/:requestId", checkDirectGuestStatus);
router.get("/:token", accessSharedMedia);
router.get("/:token/download", downloadViaShareLink);
router.post("/:token/purchase", purchaseViaShare);
router.get("/:token/payment/:requestId", checkGuestPaymentStatus);

export default router;

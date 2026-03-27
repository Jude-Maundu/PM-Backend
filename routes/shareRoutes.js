import express from "express";
import {
  generateShareLink,
  accessSharedMedia,
  downloadViaShareLink,
  revokeShareLink,
  listActiveShares,
  getShareStats
} from "../controllers/shareController.js";
import { authenticate } from "../middlewares/auth.js";

const router = express.Router();

// All protected routes require authentication
router.post("/generate", authenticate, generateShareLink);
router.get("/list", authenticate, listActiveShares);
router.get("/:token/stats", authenticate, getShareStats);
router.delete("/:token/revoke", authenticate, revokeShareLink);

// Public routes - no auth required to access shared media
router.get("/:token", accessSharedMedia);
router.get("/:token/download", downloadViaShareLink);

export default router;

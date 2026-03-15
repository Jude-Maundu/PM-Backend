import express from "express";
import {
  getSettings,
  updateSettings,
  updatePlatformFee,
  updatePayout,
  sendTestEmail,
  clearCache,
  setMaintenanceMode,
} from "../controllers/adminSettingsController.js";
import { authenticate } from "../middlewares/auth.js";
import { requireAdmin } from "../middlewares/admin.js";

console.log("✅ Admin settings router loaded");

const router = express.Router();

// All admin settings endpoints require a valid JWT and admin role
router.use(authenticate, requireAdmin);

router.get("/settings", getSettings);
router.put("/settings", updateSettings);
router.put("/settings/platform-fee", updatePlatformFee);
router.put("/settings/payout", updatePayout);
router.post("/settings/test-email", sendTestEmail);
router.post("/clear-cache", clearCache);
router.post("/maintenance-mode", setMaintenanceMode);

export default router;

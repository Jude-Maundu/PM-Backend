import express from "express";
import { authenticate } from "../middlewares/auth.js";
import { requireAdmin } from "../middlewares/admin.js";
import {
  checkMpesaConfiguration,
  testMpesaCredentials,
  getPaymentStatus,
  getMpesaLogs,
  getMpesaRetryQueue
} from "../controllers/mpesaDiagnosticsController.js";

const router = express.Router();

// Admin-only diagnostics
router.get("/config/check", authenticate, requireAdmin, checkMpesaConfiguration);
router.post("/config/test-credentials", authenticate, requireAdmin, testMpesaCredentials);

// Admin only: View payment status by ID
router.get("/payments/:checkoutRequestId", authenticate, requireAdmin, getPaymentStatus);

// Admin only: View M-Pesa logs
router.get("/logs", authenticate, requireAdmin, getMpesaLogs);

// Admin only: View retry queue
router.get("/retries", authenticate, requireAdmin, getMpesaRetryQueue);

export default router;

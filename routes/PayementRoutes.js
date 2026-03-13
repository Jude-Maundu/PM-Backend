import express from "express";
import { 
  payWithMpesa, 
  mpesaCallback, 
  buyMedia, 
  getPhotographerEarnings, 
  getAdminDashboard,
  getPhotographerEarningsSummary,
  getPurchaseHistory 
} from "../controllers/paymentController.js";
import {
  getCart,
  addToCart,
  removeFromCart,
  clearCart
} from "../controllers/cartController.js";
import {
  createReceipt,
  getReceipt,
  getUserReceipts,
  getAllReceipts
} from "../controllers/receiptController.js";
import {
  requestRefund,
  getUserRefunds,
  approveRefund,
  rejectRefund,
  processRefund,
  getAllRefunds
} from "../controllers/refundController.js";
import {
  getWalletBalance,
  getTransactions,
  addFundsToWallet
} from "../controllers/walletController.js";

const router = express.Router();

// ============================================
// PAYMENT ENDPOINTS
// ============================================
router.post("/mpesa", payWithMpesa);
router.post("/mpesa/topup", payWithMpesa);
router.post("/callback", mpesaCallback);
router.post("/buy", buyMedia);
router.get("/purchase-history/:userId", getPurchaseHistory);
router.get("/earnings/:photographerId", getPhotographerEarnings);
router.get("/earnings-summary/:photographerId", getPhotographerEarningsSummary);
router.get("/admin/dashboard", getAdminDashboard);

// ============================================
// CART ENDPOINTS
// ============================================
router.get("/cart/:userId", getCart);
router.post("/cart/add", addToCart);
router.post("/cart/remove", removeFromCart);
router.delete("/cart/:userId", clearCart);

// ============================================
// RECEIPT ENDPOINTS
// ============================================
router.post("/receipt/create", createReceipt);
router.get("/receipt/:receiptId", getReceipt);
router.get("/receipts/:userId", getUserReceipts);
router.get("/admin/receipts", getAllReceipts);

// ============================================
// REFUND ENDPOINTS
// ============================================
router.post("/refund/request", requestRefund);
router.get("/refunds/:userId", getUserRefunds);
router.post("/refund/approve", approveRefund);
router.post("/refund/reject", rejectRefund);
router.post("/refund/process", processRefund);
router.get("/admin/refunds", getAllRefunds);

// ============================================
// WALLET ENDPOINTS
// ============================================
router.get("/wallet/:userId", getWalletBalance);
router.get("/transactions/:userId", getTransactions);
router.post("/wallet/add", addFundsToWallet);

export default router;
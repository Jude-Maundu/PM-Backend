import express from "express";
import { 
  payWithMpesa, 
  mpesaCallback, 
  getUserWallet, 
  getUserTransactions, 
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

const router = express.Router();

// ============================================
// PAYMENT ROUTES
// ============================================
router.post("/mpesa", payWithMpesa);
router.post("/callback", mpesaCallback);
router.post("/buy", buyMedia);
router.get("/wallet/:userId", getUserWallet);
router.get("/transactions/:userId", getUserTransactions);
router.get("/purchase-history/:userId", getPurchaseHistory);
router.get("/earnings/:photographerId", getPhotographerEarnings);
router.get("/earnings-summary/:photographerId", getPhotographerEarningsSummary);
router.get("/admin/dashboard", getAdminDashboard);

// ============================================
// CART ROUTES
// ============================================
router.get("/cart/:userId", getCart);
router.post("/cart/add", addToCart);
router.post("/cart/remove", removeFromCart);
router.delete("/cart/:userId", clearCart);

// ============================================
// RECEIPT ROUTES
// ============================================
router.post("/receipt/create", createReceipt);
router.get("/receipt/:receiptId", getReceipt);
router.get("/receipts/:userId", getUserReceipts);
router.get("/admin/receipts", getAllReceipts);

// ============================================
// REFUND ROUTES
// ============================================
router.post("/refund/request", requestRefund);
router.get("/refunds/:userId", getUserRefunds);
router.post("/refund/approve", approveRefund);
router.post("/refund/reject", rejectRefund);
router.post("/refund/process", processRefund);
router.get("/admin/refunds", getAllRefunds);

export default router;

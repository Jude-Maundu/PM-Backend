import express from "express";
import {
  payWithMpesa,
  mpesaCallback,
  buyMedia,
  getPhotographerEarnings,
  getAdminDashboard,
  getPhotographerEarningsSummary,
  getPurchaseHistory,
  getMpesaLogs,
  getMpesaRetries,
  getPaymentStatus
} from "../controllers/paymentController.js";
import { authenticate } from "../middlewares/auth.js";
import { requireAdmin } from "../middlewares/admin.js";
import Album from "../models/album.js";
import Wallet from "../models/Wallet.js";
import User from "../models/users.js";
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

// ──────────────────────────────────────────────────────────
// Ownership guard: caller must be the owner or an admin
// ──────────────────────────────────────────────────────────
function ownsResource(paramName = "userId") {
  return (req, res, next) => {
    const callerId = (req.user?.userId || req.user?.id || req.user?._id)?.toString();
    const targetId = req.params[paramName] || req.body[paramName];
    if (!callerId) return res.status(401).json({ message: "Authentication required" });
    if (callerId !== targetId?.toString() && req.user?.role !== "admin") {
      return res.status(403).json({ message: "Forbidden: you can only access your own data" });
    }
    next();
  };
}

// ============================================
// PAYMENT ENDPOINTS
// ============================================
router.get("/mpesa", (req, res) => {
  return res.status(200).json({ message: "mpesa route is mounted", path: req.originalUrl });
});
router.post("/mpesa", authenticate, payWithMpesa);
router.post("/mpesa/topup", authenticate, payWithMpesa);

// M-Pesa callback — must remain unauthenticated (Safaricom calls it)
router.post("/callback", mpesaCallback);

// Admin only: M-Pesa logs/retries (duplicated from mpesaDiagnosticsRoutes for convenience)
router.get("/mpesa/logs", authenticate, requireAdmin, getMpesaLogs);
router.get("/mpesa/retries", authenticate, requireAdmin, getMpesaRetries);

router.post("/buy", authenticate, buyMedia);
router.get("/:paymentId", authenticate, getPaymentStatus);
router.get("/purchase-history/:userId", authenticate, ownsResource("userId"), getPurchaseHistory);
router.get("/earnings/:photographerId", authenticate, ownsResource("photographerId"), getPhotographerEarnings);
router.get("/earnings-summary/:photographerId", authenticate, ownsResource("photographerId"), getPhotographerEarningsSummary);
router.get("/admin/dashboard", authenticate, requireAdmin, getAdminDashboard);

// ============================================
// CART ENDPOINTS — all require auth + ownership
// ============================================
router.get("/cart/:userId", authenticate, ownsResource("userId"), getCart);
router.post("/cart/add", authenticate, addToCart);      // ownership checked inside controller via req.user
router.post("/cart/remove", authenticate, removeFromCart);
router.delete("/cart/:userId", authenticate, ownsResource("userId"), clearCart);

// ============================================
// RECEIPT ENDPOINTS
// ============================================
router.post("/receipt/create", authenticate, createReceipt);
router.get("/receipt/:receiptId", authenticate, getReceipt);
router.get("/receipts/:userId", authenticate, ownsResource("userId"), getUserReceipts);
router.get("/admin/receipts", authenticate, requireAdmin, getAllReceipts);

// ============================================
// REFUND ENDPOINTS
// ============================================
router.post("/refund/request", authenticate, requestRefund);
router.get("/refunds/:userId", authenticate, ownsResource("userId"), getUserRefunds);
router.post("/refund/approve", authenticate, requireAdmin, approveRefund);
router.post("/refund/reject", authenticate, requireAdmin, rejectRefund);
router.post("/refund/process", authenticate, requireAdmin, processRefund);
router.get("/admin/refunds", authenticate, requireAdmin, getAllRefunds);

// ============================================
// WALLET ENDPOINTS
// ============================================
router.get("/wallet/:userId", authenticate, ownsResource("userId"), getWalletBalance);
router.get("/transactions/:userId", authenticate, ownsResource("userId"), getTransactions);
router.post("/wallet/add", authenticate, requireAdmin, addFundsToWallet);  // admin only: manual credit

// ============================================
// ALBUM PURCHASE (wallet-based)
// ============================================
router.post("/album/:albumId/buy", authenticate, async (req, res) => {
  try {
    const { albumId } = req.params;
    const buyerId = req.user?.userId || req.user?.id || req.user?._id;

    const album = await Album.findById(albumId).populate("photographer", "username email");
    if (!album) return res.status(404).json({ message: "Album not found" });

    if (album.price <= 0) {
      return res.status(400).json({ message: "This album is free — no purchase needed" });
    }

    // Check if already purchased
    if (album.purchasedBy.map(id => id.toString()).includes(buyerId.toString())) {
      return res.status(400).json({ message: "You have already purchased this album" });
    }

    // Get buyer wallet
    let buyerWallet = await Wallet.findOne({ user: buyerId });
    if (!buyerWallet || buyerWallet.balance < album.price) {
      return res.status(402).json({ message: `Insufficient wallet balance. You need KES ${album.price} but have KES ${buyerWallet?.balance || 0}` });
    }

    const platformFee = Math.round(album.price * 0.3 * 100) / 100;
    const photographerEarning = album.price - platformFee;

    // Deduct from buyer wallet
    buyerWallet.balance -= album.price;
    buyerWallet.transactions.push({
      type: "debit",
      amount: album.price,
      description: `Album purchase: ${album.name}`,
      reference: `ALB-${albumId}`,
      createdAt: new Date(),
    });
    await buyerWallet.save();

    // Credit photographer wallet
    let photographerWallet = await Wallet.findOne({ user: album.photographer._id });
    if (!photographerWallet) {
      photographerWallet = new Wallet({ user: album.photographer._id, balance: 0, transactions: [] });
    }
    photographerWallet.balance += photographerEarning;
    photographerWallet.transactions.push({
      type: "credit",
      amount: photographerEarning,
      description: `Album sale: ${album.name}`,
      reference: `ALB-${albumId}`,
      createdAt: new Date(),
    });
    await photographerWallet.save();

    // Update photographer earnings
    await User.findByIdAndUpdate(album.photographer._id, { $inc: { totalEarnings: photographerEarning } });

    // Mark album as purchased by buyer
    album.purchasedBy.push(buyerId);
    await album.save();

    res.json({
      success: true,
      message: `Album "${album.name}" purchased successfully`,
      albumId,
      amountPaid: album.price,
      newBalance: buyerWallet.balance,
    });
  } catch (err) {
    console.error("Album purchase error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Check if buyer has purchased an album
router.get("/album/:albumId/purchased", authenticate, async (req, res) => {
  try {
    const { albumId } = req.params;
    const buyerId = req.user?.userId || req.user?.id || req.user?._id;
    const album = await Album.findById(albumId).select("purchasedBy price");
    if (!album) return res.status(404).json({ message: "Album not found" });
    const purchased = album.purchasedBy.map(id => id.toString()).includes(buyerId.toString());
    res.json({ purchased, price: album.price });
  } catch (err) {
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;

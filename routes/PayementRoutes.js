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

// ============================================
// PAYMENT ENDPOINTS
// ============================================
router.get("/mpesa", (req, res) => {
  return res.status(200).json({ message: "mpesa route is mounted", path: req.originalUrl });
});
router.post("/mpesa", payWithMpesa);
router.post("/mpesa/topup", payWithMpesa);
router.post("/mpesa/mock-callback", async (req, res) => {
  try {
    const { paymentId } = req.body;
    
    // Get the payment to get the correct CheckoutRequestID
    const Payment = (await import("../models/Payment.js")).default;
    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }
    
    const mockCallbackData = {
      Body: {
        stkCallback: {
          CheckoutRequestID: payment.checkoutRequestID,
          ResultCode: 0,
          ResultDesc: "The service request is processed successfully.",
          CallbackMetadata: {
            Item: [
              {
                Name: "MpesaReceiptNumber",
                Value: `MOCK${Date.now()}`
              },
              {
                Name: "TransactionDate",
                Value: new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)
              },
              {
                Name: "PhoneNumber",
                Value: payment.phoneNumber || "254712345678"
              }
            ]
          }
        }
      }
    };

    // Simulate callback processing
    const callbackReq = { body: mockCallbackData };
    const callbackRes = {
      status: (code) => ({
        json: (data) => {
          console.log(`Mock callback response: ${code}`, data);
          return res.status(code).json(data);
        }
      })
    };

    await mpesaCallback(callbackReq, callbackRes);
  } catch (error) {
    console.error("Mock callback error:", error);
    res.status(500).json({ error: error.message });
  }
});
router.post("/callback", mpesaCallback);
router.get("/:paymentId", getPaymentStatus);
router.get("/mpesa/logs", getMpesaLogs);
router.get("/mpesa/retries", getMpesaRetries);
router.post("/buy", buyMedia);
router.get("/purchase-history/:userId", getPurchaseHistory);
router.get("/earnings/:photographerId", getPhotographerEarnings);
router.get("/earnings-summary/:photographerId", getPhotographerEarningsSummary);
router.get("/admin/dashboard", authenticate, requireAdmin, getAdminDashboard);

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
router.get("/admin/receipts", authenticate, requireAdmin, getAllReceipts);

// ============================================
// REFUND ENDPOINTS
// ============================================
router.post("/refund/request", requestRefund);
router.get("/refunds/:userId", getUserRefunds);
router.post("/refund/approve", approveRefund);
router.post("/refund/reject", rejectRefund);
router.post("/refund/process", processRefund);
router.get("/admin/refunds", authenticate, requireAdmin, getAllRefunds);

// ============================================
// WALLET ENDPOINTS
// ============================================
router.get("/wallet/:userId", getWalletBalance);
router.get("/transactions/:userId", getTransactions);
router.post("/wallet/add", addFundsToWallet);

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
    res.status(500).json({ message: err.message });
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
    res.status(500).json({ message: err.message });
  }
});

export default router;
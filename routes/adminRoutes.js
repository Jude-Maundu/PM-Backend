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
import { getAllWithdrawals, processWithdrawal } from "../controllers/withdrawalController.js";
import User from "../models/users.js";
import ShareToken from "../models/ShareToken.js";
import Wallet from "../models/Wallet.js";

const router = express.Router();

// All admin routes require authentication and admin role
router.use(authenticate, requireAdmin);

// ==================== CONTENT MANAGEMENT ====================
router.get("/media", getAllMediaAdmin);
router.get("/albums", getAllAlbumsAdmin);
router.get("/media/:mediaId/details", getMediaDetailsAdmin);
router.get("/albums/:albumId/details", getAlbumDetailsAdmin);
router.delete("/media/:mediaId", deleteMediaAdmin);
router.delete("/albums/:albumId", deleteAlbumAdmin);

// ==================== STATISTICS & ANALYTICS ====================
router.get("/stats/overview", getPlatformStatsAdmin);

// ==================== USER MANAGEMENT ====================
router.patch("/users/:id/ban", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    user.isBanned = !user.isBanned;
    user.isActive = !user.isBanned;
    await user.save();
    res.json({ message: `User ${user.isBanned ? "banned" : "unbanned"}`, isBanned: user.isBanned });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch("/users/:id/role", async (req, res) => {
  try {
    const { role } = req.body;
    const allowed = ["admin", "photographer", "user", "institution"];
    if (!allowed.includes(role)) return res.status(400).json({ message: "Invalid role" });
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ message: "Role updated", user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch("/users/:id/verify", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    user.isVerified = !user.isVerified;
    await user.save();
    res.json({ message: `User ${user.isVerified ? "verified" : "unverified"}`, isVerified: user.isVerified });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ==================== WITHDRAWAL MANAGEMENT ====================
router.get("/withdrawals", getAllWithdrawals);
router.put("/withdrawals/:withdrawalId/process", processWithdrawal);

// ==================== SHARE LINK MANAGEMENT ====================
router.get("/shares", async (req, res) => {
  try {
    const shares = await ShareToken.find()
      .populate("createdBy", "username email")
      .populate("media", "title")
      .populate("album", "name")
      .sort({ createdAt: -1 })
      .limit(200);
    res.json({ success: true, data: shares });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/shares/:token", async (req, res) => {
  try {
    const share = await ShareToken.findOne({ token: req.params.token });
    if (!share) return res.status(404).json({ message: "Share not found" });
    share.isActive = false;
    await share.save();
    res.json({ success: true, message: "Share link revoked" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ==================== WALLET MANAGEMENT ====================
router.get("/wallets", async (req, res) => {
  try {
    const wallets = await Wallet.find()
      .populate("user", "username email role")
      .sort({ balance: -1 });
    res.json({ success: true, data: wallets });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/wallets/:userId/adjust", async (req, res) => {
  try {
    const { amount, reason } = req.body;
    if (!amount || isNaN(amount)) return res.status(400).json({ message: "Valid amount required" });
    let wallet = await Wallet.findOne({ user: req.params.userId });
    if (!wallet) wallet = new Wallet({ user: req.params.userId, balance: 0, currency: "KES" });
    wallet.balance = Math.max(0, wallet.balance + Number(amount));
    wallet.transactions = wallet.transactions || [];
    wallet.transactions.push({
      type: amount > 0 ? "credit" : "debit",
      amount: Math.abs(amount),
      description: reason || "Admin adjustment",
      date: new Date(),
    });
    await wallet.save();
    res.json({ success: true, message: "Wallet adjusted", balance: wallet.balance });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;

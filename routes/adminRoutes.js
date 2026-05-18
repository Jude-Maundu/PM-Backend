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

// ==================== ANALYTICS ====================

// GET /api/admin/analytics/revenue — daily revenue for last 30 days
router.get("/analytics/revenue", async (req, res) => {
  try {
    const Payment = (await import("../models/Payment.js")).default;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const payments = await Payment.find({ status: "completed", createdAt: { $gte: thirtyDaysAgo } })
      .select("amount createdAt");
    const byDay = {};
    payments.forEach(p => {
      const day = new Date(p.createdAt).toISOString().slice(0, 10);
      byDay[day] = (byDay[day] || 0) + (p.amount || 0);
    });
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      days.push({ date: d, revenue: byDay[d] || 0 });
    }
    res.json({ success: true, data: days });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/admin/analytics/signups — daily signups for last 30 days
router.get("/analytics/signups", async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const users = await User.find({ createdAt: { $gte: thirtyDaysAgo } }).select("createdAt role");
    const byDay = {};
    users.forEach(u => {
      const day = new Date(u.createdAt).toISOString().slice(0, 10);
      if (!byDay[day]) byDay[day] = { total: 0, buyers: 0, photographers: 0 };
      byDay[day].total++;
      if (u.role === "buyer") byDay[day].buyers++;
      if (u.role === "photographer") byDay[day].photographers++;
    });
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      days.push({ date: d, ...(byDay[d] || { total: 0, buyers: 0, photographers: 0 }) });
    }
    res.json({ success: true, data: days });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/admin/analytics/top-photographers — top 10 by wallet balance
router.get("/analytics/top-photographers", async (req, res) => {
  try {
    const wallets = await Wallet.find().sort({ balance: -1 }).limit(10)
      .populate("user", "username email profilePicture role");
    const photographers = wallets.filter(w => w.user?.role === "photographer");
    res.json({ success: true, data: photographers.map(w => ({ user: w.user, balance: w.balance })) });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/admin/analytics/overview — total counts
router.get("/analytics/overview", async (req, res) => {
  try {
    const Media = (await import("../models/media.js")).default;
    const Album = (await import("../models/album.js")).default;
    const [totalUsers, totalPhotographers, totalBuyers, totalMedia, totalAlbums] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "photographer" }),
      User.countDocuments({ role: "buyer" }),
      Media.countDocuments(),
      Album.countDocuments(),
    ]);
    res.json({ success: true, data: { totalUsers, totalPhotographers, totalBuyers, totalMedia, totalAlbums } });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ==================== CONTENT MODERATION ====================

// GET /api/admin/moderation — get flagged/pending media
router.get("/moderation", async (req, res) => {
  try {
    const Media = (await import("../models/media.js")).default;
    const { status = "flagged" } = req.query;
    const query = status === "flagged"
      ? { isFlagged: true }
      : status === "pending"
        ? { isApproved: false }
        : { $or: [{ isFlagged: true }, { isApproved: false }] };
    const media = await Media.find(query)
      .populate("photographer", "username email profilePicture")
      .sort({ createdAt: -1 });
    res.json({ success: true, media, total: media.length });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PATCH /api/admin/moderation/:id/approve
router.patch("/moderation/:id/approve", async (req, res) => {
  try {
    const Media = (await import("../models/media.js")).default;
    const media = await Media.findByIdAndUpdate(
      req.params.id,
      { isApproved: true, isFlagged: false, flagReason: "" },
      { new: true }
    );
    if (!media) return res.status(404).json({ message: "Media not found" });
    res.json({ success: true, media });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PATCH /api/admin/moderation/:id/reject
router.patch("/moderation/:id/reject", async (req, res) => {
  try {
    const Media = (await import("../models/media.js")).default;
    const media = await Media.findByIdAndUpdate(
      req.params.id,
      { isApproved: false, isFlagged: true, flagReason: req.body.reason || "Rejected by admin" },
      { new: true }
    );
    if (!media) return res.status(404).json({ message: "Media not found" });
    res.json({ success: true, media });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/admin/moderation/:id/flag — flag media (requires authentication; requireAdmin applied by router.use above)
router.post("/moderation/:id/flag", async (req, res) => {
  try {
    const Media = (await import("../models/media.js")).default;
    const media = await Media.findByIdAndUpdate(
      req.params.id,
      { isFlagged: true, flagReason: req.body.reason || "Flagged by user" },
      { new: true }
    );
    if (!media) return res.status(404).json({ message: "Media not found" });
    res.json({ success: true, message: "Photo flagged for review" });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ==================== CSV EXPORT ====================

// GET /api/admin/export/users
router.get("/export/users", async (req, res) => {
  try {
    const users = await User.find().select("username email role createdAt totalEarnings isVerified").lean();
    const header = "Username,Email,Role,Joined,Total Earnings,Verified\n";
    const rows = users.map(u =>
      `"${u.username}","${u.email}","${u.role}","${new Date(u.createdAt).toLocaleDateString()}","${u.totalEarnings || 0}","${u.isVerified ? 'Yes' : 'No'}"`
    ).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=users.csv");
    res.send(header + rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/admin/export/transactions
router.get("/export/transactions", async (req, res) => {
  try {
    const Payment = (await import("../models/Payment.js")).default;
    const payments = await Payment.find({ status: "completed" })
      .populate("user", "username email")
      .populate("media", "title price")
      .sort({ createdAt: -1 })
      .lean();
    const header = "Date,Buyer,Email,Photo,Amount,Status\n";
    const rows = payments.map(p =>
      `"${new Date(p.createdAt).toLocaleDateString()}","${p.user?.username || ''}","${p.user?.email || ''}","${p.media?.title || ''}","${p.amount || 0}","${p.status}"`
    ).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=transactions.csv");
    res.send(header + rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

export default router;

import express from "express";
import bcrypt from "bcrypt";
import os from "os";
import { authenticate } from "../middlewares/auth.js";
import { requireAdmin } from "../middlewares/admin.js";
import { requireReviewer, requireSupport, requireStaff, logAdminAction } from "../middlewares/staff.js";
import {
  getAllMediaAdmin,
  getAllAlbumsAdmin,
  getMediaDetailsAdmin,
  getAlbumDetailsAdmin,
  deleteMediaAdmin,
  deleteAlbumAdmin,
  getPlatformStatsAdmin
} from "../controllers/adminController.js";
import {
  getSecretaryDashboard,
  getEngineerDashboard,
  getMarketingDashboard,
} from "../controllers/staffDashboardController.js";
import { getAllWithdrawals, processWithdrawal } from "../controllers/withdrawalController.js";
import User from "../models/users.js";
import ShareToken from "../models/ShareToken.js";
import Wallet from "../models/Wallet.js";
import AdminLog from "../models/AdminLog.js";
import SystemConfig from "../models/SystemConfig.js";
import PhotographerApplication from "../models/PhotographerApplication.js";

const router = express.Router();
const STAFF_ROLES = ["reviewer", "support", "secretary", "engineer", "marketing"];
const MANAGEABLE_ROLES = ["admin", "photographer", "user", "institution", ...STAFF_ROLES];

function requireRoleOrAdmin(...roles) {
  return (req, res, next) => {
    const role = req.user?.role;
    if (role === "admin" || roles.includes(role)) return next();
    return res.status(403).json({ message: "Forbidden" });
  };
}

// All admin routes require authentication + at minimum staff role.
// Destructive/write endpoints individually require requireAdmin below.
router.use(authenticate, requireStaff);

// ==================== CONTENT MANAGEMENT ====================
router.get("/media", getAllMediaAdmin);
router.get("/albums", getAllAlbumsAdmin);
router.get("/media/:mediaId/details", getMediaDetailsAdmin);
router.get("/albums/:albumId/details", getAlbumDetailsAdmin);
router.delete("/media/:mediaId", requireAdmin, deleteMediaAdmin);
router.delete("/albums/:albumId", requireAdmin, deleteAlbumAdmin);

// ==================== STATISTICS & ANALYTICS ====================
router.get("/stats/overview", getPlatformStatsAdmin);

// ==================== USER MANAGEMENT ====================
router.patch("/users/:id/ban", requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    user.isBanned = !user.isBanned;
    user.isActive = !user.isBanned;
    if (user.isBanned) user.tokenVersion = (user.tokenVersion || 0) + 1; // force re-login
    await user.save();
    res.json({ message: `User ${user.isBanned ? "banned" : "unbanned"}`, isBanned: user.isBanned });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch("/users/:id/role", requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    const allowed = MANAGEABLE_ROLES;
    if (!allowed.includes(role)) return res.status(400).json({ message: "Invalid role" });
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ message: "Role updated", user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch("/users/:id/verify", requireAdmin, async (req, res) => {
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
router.put("/withdrawals/:withdrawalId/process", requireAdmin, processWithdrawal);

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

router.delete("/shares/:token", requireAdmin, async (req, res) => {
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

router.post("/wallets/:userId/adjust", requireAdmin, async (req, res) => {
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
      createdAt: new Date(),
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
router.patch("/moderation/:id/approve", requireAdmin, async (req, res) => {
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
router.patch("/moderation/:id/reject", requireAdmin, async (req, res) => {
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
router.post("/moderation/:id/flag", requireAdmin, async (req, res) => {
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

// ==================== HEALTH DASHBOARD ====================

router.get("/health", async (req, res) => {
  try {
    const Payment   = (await import("../models/Payment.js")).default;
    const Withdrawal = (await import("../models/Withdrawal.js")).default;
    const Media      = (await import("../models/media.js")).default;

    const now       = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart  = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const [
      salesToday,
      salesWeek,
      pendingWithdrawals,
      pendingWithdrawalAmount,
      pendingMediaCount,
      pendingApplications,
      failedWithdrawals,
      totalUsers,
      bannedUsers,
    ] = await Promise.all([
      Payment.aggregate([{ $match: { status: 'completed', createdAt: { $gte: todayStart } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Payment.aggregate([{ $match: { status: 'completed', createdAt: { $gte: weekStart  } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Withdrawal.countDocuments({ status: { $in: ['pending', 'processing'] } }),
      Withdrawal.aggregate([{ $match: { status: { $in: ['pending', 'processing'] } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Media.countDocuments({ isApproved: false, isFlagged: false }),
      PhotographerApplication.countDocuments({ status: 'pending' }),
      Withdrawal.countDocuments({ status: 'failed', createdAt: { $gte: weekStart } }),
      User.countDocuments(),
      User.countDocuments({ isBanned: true }),
    ]);

    const loadAvg  = os.loadavg();
    const freeMem  = os.freemem();
    const totalMem = os.totalmem();

    res.json({
      success: true,
      data: {
        sales: {
          today: salesToday[0]?.total || 0,
          week:  salesWeek[0]?.total  || 0,
        },
        withdrawals: {
          pending:       pendingWithdrawals,
          pendingAmount: pendingWithdrawalAmount[0]?.total || 0,
          failedThisWeek: failedWithdrawals,
        },
        content: {
          pendingApprovals:     pendingMediaCount,
          pendingApplications,
        },
        users: { total: totalUsers, banned: bannedUsers },
        server: {
          loadAvg1m:    loadAvg[0].toFixed(2),
          memUsedPct:   (((totalMem - freeMem) / totalMem) * 100).toFixed(1),
          uptimeHours:  (process.uptime() / 3600).toFixed(1),
        },
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ==================== STAFF DASHBOARDS ====================

router.get("/staff-dashboard/secretary", requireRoleOrAdmin("secretary"), getSecretaryDashboard);
router.get("/staff-dashboard/engineer", requireRoleOrAdmin("engineer"), getEngineerDashboard);
router.get("/staff-dashboard/marketing", requireRoleOrAdmin("marketing"), getMarketingDashboard);

// ==================== SYSTEM CONFIG / FEATURE FLAGS ====================

router.get("/config", async (req, res) => {
  try {
    const configs = await SystemConfig.find().sort({ category: 1, key: 1 });
    res.json({ success: true, data: configs });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.patch("/config/:key", requireRoleOrAdmin("engineer"), logAdminAction('update_config', 'SystemConfig'), async (req, res) => {
  try {
    const { value } = req.body;
    if (value === undefined) return res.status(400).json({ message: 'value is required' });
    const adminId = req.user?.userId || req.user?.id;
    const doc = await SystemConfig.set(req.params.key, value, adminId);
    res.json({ success: true, config: doc });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Bulk update config
router.put("/config", requireRoleOrAdmin("engineer"), logAdminAction('bulk_update_config', 'SystemConfig'), async (req, res) => {
  try {
    const { configs } = req.body; // [{ key, value }]
    if (!Array.isArray(configs)) return res.status(400).json({ message: 'configs array required' });
    const adminId = req.user?.userId || req.user?.id;
    await Promise.all(configs.map(({ key, value }) => SystemConfig.set(key, value, adminId)));
    res.json({ success: true, message: 'Config updated' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ==================== PHOTOGRAPHER APPLICATIONS ====================

router.get("/applications", async (req, res) => {
  try {
    const { status = 'pending', page = 1, limit = 20 } = req.query;
    const query = status === 'all' ? {} : { status };
    const total = await PhotographerApplication.countDocuments(query);
    const apps  = await PhotographerApplication.find(query)
      .populate('user', 'username email profilePicture createdAt')
      .populate('reviewedBy', 'username')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    res.json({ success: true, data: apps, total });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.patch("/applications/:id/approve", requireRoleOrAdmin("secretary", "reviewer", "support"), logAdminAction('approve_application', 'PhotographerApplication'), async (req, res) => {
  try {
    const app = await PhotographerApplication.findById(req.params.id).populate('user');
    if (!app) return res.status(404).json({ message: 'Application not found' });

    const adminId = req.user?.userId || req.user?.id;
    app.status      = 'approved';
    app.reviewedBy  = adminId;
    app.reviewedAt  = new Date();
    app.reviewNotes = req.body.notes || '';
    await app.save();

    // Upgrade user role to photographer
    await User.findByIdAndUpdate(app.user._id, { role: 'photographer' });

    res.json({ success: true, message: `${app.user.username} approved as photographer` });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.patch("/applications/:id/reject", requireRoleOrAdmin("secretary", "reviewer", "support"), logAdminAction('reject_application', 'PhotographerApplication'), async (req, res) => {
  try {
    const app = await PhotographerApplication.findById(req.params.id);
    if (!app) return res.status(404).json({ message: 'Application not found' });

    const adminId = req.user?.userId || req.user?.id;
    app.status      = 'rejected';
    app.reviewedBy  = adminId;
    app.reviewedAt  = new Date();
    app.reviewNotes = req.body.reason || '';
    await app.save();

    res.json({ success: true, message: 'Application rejected' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ==================== ADMIN ACTION LOGS ====================

router.get("/logs", async (req, res) => {
  try {
    const { page = 1, limit = 50, action, adminId } = req.query;
    const query = {};
    if (action)  query.action  = { $regex: action, $options: 'i' };
    if (adminId) query.admin   = adminId;

    const total = await AdminLog.countDocuments(query);
    const logs  = await AdminLog.find(query)
      .populate('admin', 'username email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ success: true, data: logs, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ==================== STAFF MANAGEMENT ====================

router.get("/staff", async (req, res) => {
  try {
    const staff = await User.find({ role: { $in: STAFF_ROLES } })
      .select('username email role staffPermissions createdAt isActive isBanned')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: staff });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post("/staff", requireAdmin, logAdminAction('create_staff', 'User'), async (req, res) => {
  try {
    const { username, email, password, role, permissions = {} } = req.body;
    if (!STAFF_ROLES.includes(role))
      return res.status(400).json({ message: `Role must be one of: ${STAFF_ROLES.join(", ")}` });
    if (!password || password.length < 8)
      return res.status(400).json({ message: 'Password must be at least 8 characters' });

    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ message: 'Email already in use' });

    const hashed = await bcrypt.hash(password, 10);
    const staff  = await User.create({
      username, email, password: hashed, role,
      staffPermissions: permissions,
      isVerified: true,
    });

    res.status(201).json({ success: true, message: 'Staff member created', staff: { _id: staff._id, username, email, role } });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.patch("/staff/:id/permissions", requireAdmin, logAdminAction('update_staff_permissions', 'User'), async (req, res) => {
  try {
    const { permissions, role } = req.body;
    const update = {};
    if (permissions) update.staffPermissions = permissions;
    if (role && STAFF_ROLES.includes(role)) update.role = role;

    const staff = await User.findByIdAndUpdate(req.params.id, update, { new: true })
      .select('username email role staffPermissions');
    if (!staff) return res.status(404).json({ message: 'Staff not found' });

    res.json({ success: true, staff });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete("/staff/:id", requireAdmin, logAdminAction('remove_staff', 'User'), async (req, res) => {
  try {
    const staff = await User.findById(req.params.id);
    if (!staff) return res.status(404).json({ message: 'Staff not found' });
    if (!STAFF_ROLES.includes(staff.role))
      return res.status(400).json({ message: 'User is not a staff member' });

    staff.role    = 'user';
    staff.isBanned = true;
    staff.tokenVersion = (staff.tokenVersion || 0) + 1;
    await staff.save();

    res.json({ success: true, message: 'Staff access revoked' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ==================== KYC / IDENTITY VERIFICATION ====================

router.get("/kyc", async (req, res) => {
  try {
    const { status = 'pending' } = req.query;
    const query = status === 'all' ? { kycStatus: { $ne: 'not_submitted' } } : { kycStatus: status };
    const users = await User.find(query)
      .select('username email kycStatus kycSubmittedAt kycReviewedAt kycRejectionReason profilePicture')
      .sort({ kycSubmittedAt: -1 });
    res.json({ success: true, data: users });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.patch("/kyc/:userId/verify", requireAdmin, logAdminAction('kyc_verify', 'User'), async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.userId,
      { kycStatus: 'verified', kycReviewedAt: new Date(), kycRejectionReason: '' },
      { new: true }
    ).select('username email kycStatus');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ success: true, message: `${user.username} KYC verified`, user });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.patch("/kyc/:userId/reject", requireAdmin, logAdminAction('kyc_reject', 'User'), async (req, res) => {
  try {
    const { reason = 'Documents unclear or invalid' } = req.body;
    const user = await User.findByIdAndUpdate(req.params.userId,
      { kycStatus: 'rejected', kycReviewedAt: new Date(), kycRejectionReason: reason },
      { new: true }
    ).select('username email kycStatus');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ success: true, message: `${user.username} KYC rejected`, user });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ==================== DYNAMIC COMMISSION ====================

router.patch("/users/:id/commission", requireAdmin, logAdminAction('update_commission', 'User'), async (req, res) => {
  try {
    const { rate } = req.body;
    if (rate !== null && (isNaN(rate) || rate < 0 || rate > 100))
      return res.status(400).json({ message: 'Rate must be 0–100 or null (to use default)' });

    const user = await User.findByIdAndUpdate(req.params.id, { commissionRate: rate ?? null }, { new: true })
      .select('username email commissionRate');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ success: true, message: `Commission rate set to ${rate ?? 'default'}%`, user });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ==================== SYSTEM RESET ====================

router.post("/system/reset", requireAdmin, async (req, res) => {
  try {
    const { password, confirmPhrase } = req.body;

    if (confirmPhrase !== 'RESET SYSTEM') {
      return res.status(400).json({ message: 'Type "RESET SYSTEM" exactly to confirm' });
    }

    // Verify admin password
    const adminId = req.user?.userId || req.user?.id;
    const admin   = await User.findById(adminId).select('+password');
    if (!admin?.password) return res.status(400).json({ message: 'Cannot verify password for OAuth-only accounts' });
    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) return res.status(403).json({ message: 'Incorrect password' });

    // Wipe system settings + logs (keep users, media, financial data)
    const [logCount, configCount] = await Promise.all([
      AdminLog.deleteMany({}),
      SystemConfig.deleteMany({}),
    ]);

    // Re-seed defaults
    const { seedDefaults } = await import('../models/SystemConfig.js');
    await seedDefaults();

    res.json({
      success: true,
      message: 'System settings and audit logs cleared. Defaults restored.',
      wiped: { logs: logCount.deletedCount, configs: configCount.deletedCount },
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

export default router;

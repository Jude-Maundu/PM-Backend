import express from "express";
import { authenticate } from "../middlewares/auth.js";
import User from "../models/users.js";
import crypto from "crypto";

const router = express.Router();

// GET /api/referral/my-code — get or generate referral code
router.get("/my-code", authenticate, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?._id;
    let user = await User.findById(userId).select("referralCode username referralEarnings");
    if (!user.referralCode) {
      user.referralCode = user.username.toLowerCase().replace(/[^a-z0-9]/g, "") + "-" + crypto.randomBytes(3).toString("hex");
      await user.save();
    }
    res.json({ success: true, referralCode: user.referralCode, referralEarnings: user.referralEarnings });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/referral/stats — how many people I referred
router.get("/stats", authenticate, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?._id;
    const referredUsers = await User.find({ referredBy: userId }).select("username createdAt role");
    const user = await User.findById(userId).select("referralEarnings referralCode");
    res.json({ success: true, referredUsers, total: referredUsers.length, referralEarnings: user.referralEarnings || 0, referralCode: user.referralCode });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;

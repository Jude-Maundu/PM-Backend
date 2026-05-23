import express from 'express';
import rateLimit from 'express-rate-limit';
import passport from '../config/passport.js';
import {register, login, updatePhotographerPhone, googleAuthCallback, getCurrentUser, changePassword} from '../controllers/authController.js';
import { uploadProfile } from '../middlewares/upload.js';
import { getAllUsers, getUser, updateUser, DeleteUser } from '../controllers/authController.js';
import { followUser, unfollowUser, getUserFollowers, getUserFollowing, isFollowing } from '../controllers/followController.js';
import { authenticate } from '../middlewares/auth.js';

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many auth requests, please try again in 15 minutes.' }
});

// Traditional auth routes
router.post('/register', authLimiter, uploadProfile.single('profilePicture'), register);
router.post('/login', authLimiter, login);
router.get('/me', authenticate, getCurrentUser);
router.get('/users/me', authenticate, getCurrentUser); // Alias for /me

// Google OAuth routes - with fallback error handling if credentials not configured
router.get('/google', (req, res, next) => {
  // Check if Google OAuth is configured
  if (!process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID.includes('your_')) {
    return res.status(503).json({
      error: 'Google OAuth is not configured',
      message: 'Please configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in environment variables'
    });
  }
  // If configured, use Passport
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

router.get('/google/callback', (req, res, next) => {
  // Check if Google OAuth is configured
  if (!process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID.includes('your_')) {
    return res.status(503).json({
      error: 'Google OAuth is not configured',
      message: 'Please configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in environment variables'
    });
  }
  // If configured, use Passport
  passport.authenticate('google', (err, user, info) => {
    if (err) return next(err);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    if (!user) return res.redirect(`${frontendUrl}/login?error=auth_failed`);
    req.user = user; // custom callbacks don't set req.user automatically
    googleAuthCallback(req, res, next);
  })(req, res, next);
});

// User management routes
router.get('/users', getAllUsers);
router.get('/users/:id', getUser);
router.put('/users/:id', uploadProfile.single('profilePicture'), updateUser);
router.post('/users/:id/change-password', authenticate, changePassword);
router.put('/photographers/:id/phone', updatePhotographerPhone);
router.delete('/users/:id', DeleteUser);

// Follow routes
router.post('/users/:userId/follow', authenticate, followUser);
router.post('/users/:userId/unfollow', authenticate, unfollowUser);
router.get('/users/:userId/followers', getUserFollowers);
router.get('/users/:userId/following', getUserFollowing);
router.get('/users/:userId/is-following', authenticate, isFollowing);

// GET /api/auth/photographers/related/:id
router.get("/photographers/related/:id", async (req, res) => {
  try {
    const User = (await import("../models/users.js")).default;
    const source = await User.findById(req.params.id).select("location skills");
    const related = await User.find({
      _id: { $ne: req.params.id },
      role: "photographer",
      $or: [
        { location: source?.location },
        { skills: { $in: source?.skills || [] } },
      ],
    }).select("username profilePicture bio location isVerified").limit(4);
    res.json({ success: true, photographers: related });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

export default router;
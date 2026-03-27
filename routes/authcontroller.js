import express from 'express';
import passport from '../config/passport.js';
import {register, login, updatePhotographerPhone, googleAuthCallback, getCurrentUser} from '../controllers/authController.js';
import { uploadProfile } from '../middlewares/upload.js';
import { getAllUsers, getUser, updateUser, DeleteUser } from '../controllers/authController.js';
import { followUser, unfollowUser, getUserFollowers, getUserFollowing, isFollowing } from '../controllers/followController.js';
import { authenticate } from '../middlewares/auth.js';

const router = express.Router();

// Traditional auth routes
router.post('/register', uploadProfile.single('profilePicture'), register);
router.post('/login', login);
router.get('/me', authenticate, getCurrentUser);

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
  passport.authenticate('google', { failureRedirect: '/login' }, (err, user, info) => {
    if (err) return next(err);
    if (!user) return res.redirect('/login?error=auth_failed');
    googleAuthCallback(req, res, next);
  })(req, res, next);
});

// User management routes
router.get('/users', getAllUsers);
router.get('/users/:id', getUser);
router.put('/users/:id', uploadProfile.single('profilePicture'), updateUser);
router.put('/photographers/:id/phone', updatePhotographerPhone);
router.delete('/users/:id', DeleteUser);

// Follow routes
router.post('/users/:userId/follow', authenticate, followUser);
router.post('/users/:userId/unfollow', authenticate, unfollowUser);
router.get('/users/:userId/followers', getUserFollowers);
router.get('/users/:userId/following', getUserFollowing);
router.get('/users/:userId/is-following', authenticate, isFollowing);

export default router;
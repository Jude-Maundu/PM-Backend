import express from 'express';
import { authenticate } from '../middlewares/auth.js';
import { requireAdmin } from '../middlewares/admin.js';
import Portfolio from '../models/Portfolio.js';
import User from '../models/users.js';

const router = express.Router();

// GET /api/portfolio/me — returns own portfolio (requires auth)
router.get('/me', authenticate, async (req, res) => {
  try {
    const photographerId = req.user?.userId || req.user?.id || req.user?._id;
    const portfolio = await Portfolio.findOne({ photographer: photographerId });
    if (!portfolio) {
      return res.status(404).json({ success: false, message: 'No portfolio found' });
    }
    res.json({ success: true, portfolio });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Internal server error' });
  }
});

// PUT /api/portfolio — upsert own portfolio (requires auth)
router.put('/', authenticate, async (req, res) => {
  try {
    const photographerId = req.user?.userId || req.user?.id || req.user?._id;

    const user = await User.findById(photographerId).select('username');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const updateData = {
      ...req.body,
      photographer: photographerId,
      username: user.username,
    };

    const portfolio = await Portfolio.findOneAndUpdate(
      { photographer: photographerId },
      { $set: updateData },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, portfolio });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Internal server error' });
  }
});

// ==================== ADMIN ROUTES (must be before /:username wildcard) ====================

// GET /api/portfolio/admin/all — list every portfolio
router.get('/admin/all', authenticate, requireAdmin, async (req, res) => {
  try {
    const portfolios = await Portfolio.find()
      .populate('photographer', 'username email profilePicture')
      .sort({ updatedAt: -1 });
    res.json({ success: true, portfolios });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/portfolio/admin/:id/toggle-publish — flip isPublished
router.patch('/admin/:id/toggle-publish', authenticate, requireAdmin, async (req, res) => {
  try {
    const portfolio = await Portfolio.findById(req.params.id);
    if (!portfolio) return res.status(404).json({ success: false, message: 'Portfolio not found' });
    portfolio.isPublished = !portfolio.isPublished;
    await portfolio.save();
    res.json({ success: true, isPublished: portfolio.isPublished });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/portfolio/admin/:id — admin preview (works even if unpublished)
router.get('/admin/:id/preview', authenticate, requireAdmin, async (req, res) => {
  try {
    const portfolio = await Portfolio.findById(req.params.id)
      .populate('featuredMediaIds', 'title fileUrl price mediaType')
      .populate('featuredAlbumIds', 'name coverImage price mediaCount')
      .populate('photographer', 'username email profilePicture bio location');
    if (!portfolio) return res.status(404).json({ success: false, message: 'Portfolio not found' });
    res.json({ success: true, portfolio });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/portfolio/admin/:id — remove a portfolio
router.delete('/admin/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const portfolio = await Portfolio.findByIdAndDelete(req.params.id);
    if (!portfolio) return res.status(404).json({ success: false, message: 'Portfolio not found' });
    res.json({ success: true, message: 'Portfolio deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== PUBLIC ROUTE (wildcard — must stay last) ====================

// GET /api/portfolio/:username — public, no auth
router.get('/:username', async (req, res) => {
  try {
    const { username } = req.params;

    const portfolio = await Portfolio.findOne({ username, isPublished: true })
      .populate('featuredMediaIds', 'title fileUrl price mediaType')
      .populate('featuredAlbumIds', 'name coverImage price mediaCount')
      .populate('photographer', 'username email profilePicture bio location');

    if (!portfolio) {
      return res.status(404).json({ success: false, message: 'Portfolio not found or not published' });
    }

    res.json({ success: true, portfolio });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Internal server error' });
  }
});

export default router;

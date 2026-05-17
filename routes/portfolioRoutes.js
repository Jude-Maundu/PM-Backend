import express from 'express';
import { authenticate } from '../middlewares/auth.js';
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
    console.error('[portfolioRoutes] GET /me error:', err);
    res.status(500).json({ success: false, message: err.message || 'Internal server error' });
  }
});

// PUT /api/portfolio — upsert own portfolio (requires auth)
router.put('/', authenticate, async (req, res) => {
  try {
    const photographerId = req.user?.userId || req.user?.id || req.user?._id;

    // Get photographer's username from User model
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
    console.error('[portfolioRoutes] PUT / error:', err);
    res.status(500).json({ success: false, message: err.message || 'Internal server error' });
  }
});

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
    console.error('[portfolioRoutes] GET /:username error:', err);
    res.status(500).json({ success: false, message: err.message || 'Internal server error' });
  }
});

export default router;

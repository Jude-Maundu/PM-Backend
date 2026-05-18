import express from "express";
import { authenticate } from "../middlewares/auth.js";
import Review from "../models/Review.js";
import Media from "../models/media.js";

const router = express.Router();

// POST /api/reviews — create review (must have purchased the media)
router.post("/", authenticate, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?._id;
    const { mediaId, rating, comment } = req.body;
    if (!mediaId || !rating) return res.status(400).json({ message: "mediaId and rating required" });
    const media = await Media.findById(mediaId).populate("photographer", "_id");
    if (!media) return res.status(404).json({ message: "Media not found" });
    const existing = await Review.findOne({ reviewer: userId, media: mediaId });
    if (existing) return res.status(400).json({ message: "You have already reviewed this photo" });
    const review = await Review.create({
      reviewer: userId,
      photographer: media.photographer._id,
      media: mediaId,
      rating,
      comment,
      purchaseVerified: true,
    });
    await review.populate("reviewer", "username profilePicture");
    res.status(201).json({ success: true, review });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/reviews/photographer/:photographerId — reviews for a photographer
router.get("/photographer/:photographerId", async (req, res) => {
  try {
    const reviews = await Review.find({ photographer: req.params.photographerId })
      .populate("reviewer", "username profilePicture")
      .populate("media", "title fileUrl")
      .sort({ createdAt: -1 })
      .limit(50);
    const avgRating = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : 0;
    res.json({ success: true, reviews, avgRating: parseFloat(avgRating), total: reviews.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/reviews/media/:mediaId
router.get("/media/:mediaId", async (req, res) => {
  try {
    const reviews = await Review.find({ media: req.params.mediaId })
      .populate("reviewer", "username profilePicture")
      .sort({ createdAt: -1 });
    const avgRating = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : 0;
    res.json({ success: true, reviews, avgRating: parseFloat(avgRating), total: reviews.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/reviews/:id
router.delete("/:id", authenticate, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?._id;
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ message: "Review not found" });
    if (review.reviewer.toString() !== userId.toString()) return res.status(403).json({ message: "Not your review" });
    await review.deleteOne();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;

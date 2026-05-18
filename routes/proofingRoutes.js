import express from "express";
import crypto from "crypto";
import { authenticate } from "../middlewares/auth.js";
import ProofingGallery from "../models/ProofingGallery.js";
import Media from "../models/media.js";

const router = express.Router();

// POST /api/proofing — create gallery (photographer)
router.post("/", authenticate, async (req, res) => {
  try {
    const photographerId = req.user?.userId || req.user?.id || req.user?._id;
    const { title, clientName, clientEmail, mediaIds, message, expiresInDays = 7 } = req.body;
    const token = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
    const approvals = (mediaIds || []).map(id => ({ mediaId: id, status: "pending" }));
    const gallery = await ProofingGallery.create({
      photographer: photographerId,
      title,
      clientName,
      clientEmail,
      mediaIds,
      approvals,
      token,
      expiresAt,
      message,
    });
    res.status(201).json({ success: true, gallery, proofingUrl: `/proofing/${token}` });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/proofing/my — photographer's galleries
router.get("/my", authenticate, async (req, res) => {
  try {
    const photographerId = req.user?.userId || req.user?.id || req.user?._id;
    const galleries = await ProofingGallery.find({ photographer: photographerId })
      .populate("mediaIds", "title fileUrl")
      .sort({ createdAt: -1 });
    res.json({ success: true, galleries });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/proofing/:token — public client view
router.get("/:token", async (req, res) => {
  try {
    const gallery = await ProofingGallery.findOne({ token: req.params.token, isActive: true })
      .populate("mediaIds", "title fileUrl mediaType description")
      .populate("photographer", "username profilePicture");
    if (!gallery) return res.status(404).json({ message: "Proofing gallery not found or expired" });
    if (gallery.expiresAt && new Date() > gallery.expiresAt) {
      gallery.isActive = false;
      await gallery.save();
      return res.status(403).json({ message: "This proofing gallery has expired" });
    }
    res.json({ success: true, gallery });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PATCH /api/proofing/:token/approve/:mediaId
router.patch("/:token/approve/:mediaId", async (req, res) => {
  try {
    const { status = "approved", note = "" } = req.body;
    const gallery = await ProofingGallery.findOne({ token: req.params.token });
    if (!gallery) return res.status(404).json({ message: "Gallery not found" });
    const approval = gallery.approvals.find(a => a.mediaId.toString() === req.params.mediaId);
    if (approval) {
      approval.status = status;
      approval.note = note;
    } else {
      gallery.approvals.push({ mediaId: req.params.mediaId, status, note });
    }
    await gallery.save();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE /api/proofing/:id — photographer deletes
router.delete("/:id", authenticate, async (req, res) => {
  try {
    const photographerId = req.user?.userId || req.user?.id || req.user?._id;
    const gallery = await ProofingGallery.findOne({ _id: req.params.id, photographer: photographerId });
    if (!gallery) return res.status(404).json({ message: "Not found" });
    await gallery.deleteOne();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

export default router;

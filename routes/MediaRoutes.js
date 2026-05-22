import express from "express";
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import {
  getAllMedia,
  getOneMedia,
  getMyMedia,
  createMedia,
  updateMedia,
  deleteMedia,
  getProtectedMedia,
  downloadMedia,
  createAlbum,
  getAlbums,
  getAlbum,
  updateAlbum,
  deleteAlbum,
  createEventAccess,
  getEventMediaByToken,
  getMediaPrice,
  updateMediaPrice,
  likeMedia,
  unlikeMedia,
  getLikedMedia,
  bulkUploadAlbumMedia,
  getTrendingMedia,
  getSimilarMedia,
  getMediaByCategory,
  faceSearch
} from "../controllers/MediaController.js";
import { addMediaToAlbum, removeMediaFromAlbum, getAlbumMedia } from "../controllers/albumController.js";

import { uploadPhoto } from "../middlewares/upload.js";
import { authenticate } from "../middlewares/auth.js";
import { requirePhotographer } from "../middlewares/photographer.js";

// Memory-storage multer for face search (Rekognition needs raw bytes via req.file.buffer)
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5 MB cap for selfie images
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // 30 uploads per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many upload requests, please try again in 15 minutes.' }
});

const router = express.Router();

// Album routes MUST come before /:id catch-all route
router.post("/album", authenticate, uploadLimiter, uploadPhoto.single("coverImage"), createAlbum);
router.post("/album/bulk-upload", authenticate, uploadLimiter, uploadPhoto.array("files", 20), bulkUploadAlbumMedia);
router.post("/bulk-upload", authenticate, uploadLimiter, uploadPhoto.array("files", 20), bulkUploadAlbumMedia);
router.get("/albums", authenticate, getAlbums);
router.get("/albums/public", async (req, res) => {
  try {
    const albums = await (await import("../models/album.js")).default
      .find({ isPrivate: { $ne: true } })
      .populate("photographer", "username email profilePicture")
      .sort({ createdAt: -1 });
    res.json({ success: true, albums });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
router.get("/album/:albumId/public", async (req, res) => {
  try {
    const Album = (await import("../models/album.js")).default;
    const Media = (await import("../models/media.js")).default;
    const album = await Album.findById(req.params.albumId)
      .populate("photographer", "username profilePicture watermark");
    if (!album || album.isPrivate) return res.status(404).json({ message: "Gallery not found" });
    const media = await Media.find({ album: album._id, isPrivate: false, isApproved: true })
      .select("title price fileUrl watermarkedUrl mediaType _id")
      .sort({ createdAt: -1 });
    res.json({ success: true, album, media });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
router.get("/album/:albumId", authenticate, getAlbum);
router.put("/album/:albumId", authenticate, uploadPhoto.single("coverImage"), updateAlbum);
router.delete("/album/:albumId", authenticate, deleteAlbum);
router.post("/album/:albumId/add", authenticate, addMediaToAlbum);
router.delete("/album/:albumId/remove/:mediaId", authenticate, removeMediaFromAlbum);
router.get("/album/:albumId/media", authenticate, getAlbumMedia);
// Allow event access token creation via authenticated user; ownership is enforced in controller.
router.post("/album/:albumId/access", authenticate, createEventAccess);
router.get("/album/:albumId/access", authenticate, createEventAccess);
router.get("/album/:albumId/access/:token", getEventMediaByToken);

// Face search route — must be before /:id catch-all
router.post("/face-search", authenticate, memoryUpload.single("selfie"), faceSearch);

// Media routes
router.get("/", getAllMedia);
router.get("/mine", authenticate, getMyMedia);
router.get("/trending", getTrendingMedia);
router.get("/filter/:category", getMediaByCategory);
router.get("/filter", getMediaByCategory);
router.get("/:id/similar", getSimilarMedia);
router.get("/:id", getOneMedia);
router.get("/:id/protected", authenticate, getProtectedMedia);
router.get("/:id/download", authenticate, downloadMedia);
router.get("/:id/price", getMediaPrice);
router.get("/liked", authenticate, getLikedMedia);
router.post("/:id/like", authenticate, likeMedia);
router.post("/:id/unlike", authenticate, unlikeMedia);

router.post("/", authenticate, uploadLimiter, uploadPhoto.single("file"), createMedia);
router.put("/:id", authenticate, uploadLimiter, uploadPhoto.single("file"), updateMedia);
router.put("/:id/price", authenticate, updateMediaPrice);
router.delete("/:id", authenticate, deleteMedia);

export default router;







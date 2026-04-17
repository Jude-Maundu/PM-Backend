import express from "express";
import rateLimit from 'express-rate-limit';
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
  bulkUploadAlbumMedia
} from "../controllers/MediaController.js";
import { addMediaToAlbum, removeMediaFromAlbum, getAlbumMedia } from "../controllers/albumController.js";
 
import { uploadPhoto } from "../middlewares/upload.js";
import { authenticate } from "../middlewares/auth.js";
import { requirePhotographer } from "../middlewares/photographer.js";

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many upload requests, please try again in 15 minutes.' }
});

const router = express.Router();

// Album routes MUST come before /:id catch-all route
router.post("/album", authenticate, uploadLimiter, uploadPhoto.single("coverImage"), createAlbum);
router.post("/album/bulk-upload", authenticate, uploadLimiter, uploadPhoto.array("files", 20), bulkUploadAlbumMedia);
router.post("/bulk-upload", authenticate, uploadLimiter, uploadPhoto.array("files", 20), bulkUploadAlbumMedia);
router.get("/albums", getAlbums);
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

// Media routes
router.get("/", getAllMedia);
router.get("/mine", authenticate, getMyMedia);
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







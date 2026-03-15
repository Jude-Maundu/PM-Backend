import express from "express";
import { 
  getAllMedia, 
  getOneMedia, 
  createMedia, 
  updateMedia, 
  deleteMedia,
  getProtectedMedia,
  downloadMedia,
  createEventAccess,
  getEventMediaByToken,
  updateMediaPrice
} from "../controllers/MediaController.js";
 
import { uploadPhoto } from "../middlewares/upload.js";
import { authenticate } from "../middlewares/auth.js";
import { requirePhotographer } from "../middlewares/photographer.js";

const router = express.Router();

router.get("/", getAllMedia);
router.get("/:id", getOneMedia);
router.get("/:id/protected", authenticate, getProtectedMedia);
router.get("/:id/download", authenticate, downloadMedia);

router.post("/album", authenticate, requirePhotographer, createAlbum);
router.post("/album/:albumId/access", authenticate, requirePhotographer, createEventAccess);
router.get("/album/:albumId/access/:token", getEventMediaByToken);

router.post("/", uploadPhoto.single("file"), createMedia);
router.put("/:id", uploadPhoto.single("file"), updateMedia);
router.put("/:id/price", updateMediaPrice);
router.delete("/:id", deleteMedia);

export default router;







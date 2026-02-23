import express from "express";
import { 
  getAllMedia, 
  getOneMedia, 
  createMedia, 
  updateMedia, 
  deleteMedia,
  getProtectedMedia,
  updateMediaPrice
} from "../controllers/MediaController.js";
 
import { uploadPhoto } from "../middlewares/upload.js";

const router = express.Router();

router.get("/", getAllMedia);
router.get("/:id", getOneMedia);
router.get("/:id/protected", getProtectedMedia);
router.post("/", uploadPhoto.single("file"), createMedia);
router.put("/:id", uploadPhoto.single("file"), updateMedia);
router.put("/:id/price", updateMediaPrice);
router.delete("/:id", deleteMedia);

export default router;







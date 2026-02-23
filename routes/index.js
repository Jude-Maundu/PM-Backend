import express from "express";

// Controllers
import { register, login } from "../controllers/authController.js";
import {
  getAllMedia,
  getOneMedia,
  createMedia,
  updateMedia,
  deleteMedia,
} from "../controllers/MediaController.js";
import {
  payWithMpesa,
  mpesaCallback,
  getUserWallet,
  getUserTransactions,
  buyMedia,
  getPhotographerEarnings,
  getAdminDashboard,
} from "../controllers/paymentController.js";

// Middleware
import { uploadPhoto, uploadProfile } from "../middlewares/upload.js";
import Media from "../models/media.js";

const router = express.Router();

// ============================================
// AUTH ROUTES
// ============================================
router.post("/auth/register", uploadProfile.single("profilePicture"), register);
router.post("/auth/login", login);

// ============================================
// MEDIA ROUTES
// ============================================
router.get("/media", getAllMedia);
router.get("/media/:id", getOneMedia);
router.post("/media", uploadPhoto.single("file"), createMedia);
router.put("/media/:id", uploadPhoto.single("file"), updateMedia);
router.delete("/media/:id", deleteMedia);

// Media Search
router.get("/media/search", async (req, res) => {
  try {
    const { title, mediaType, photographer, minPrice, maxPrice } = req.query;
    const query = {};

    if (title) query.title = { $regex: title, $options: "i" };
    if (mediaType) query.mediaType = mediaType;
    if (photographer) query.photographer = photographer;
    if (minPrice) query.price = { ...query.price, $gte: minPrice };
    if (maxPrice) query.price = { ...query.price, $lte: maxPrice };

    const media = await Media.find(query).populate("photographer", "username");
    res.json(media);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ============================================
// PAYMENT ROUTES
// ============================================
router.post("/payments/mpesa", payWithMpesa);
router.post("/payments/callback", mpesaCallback);
router.post("/payments/buy", buyMedia);
router.get("/payments/wallet/:userId", getUserWallet);
router.get("/payments/transactions/:userId", getUserTransactions);
router.get("/payments/earnings/:photographerId", getPhotographerEarnings);
router.get("/payments/admin/dashboard", getAdminDashboard);

export default router;

import express from "express";
import {
  getUserFavorites,
  addFavorite,
  removeFavorite,
  isFavorited
} from "../controllers/favoriteController.js";
import { authenticate } from "../middlewares/auth.js";

const router = express.Router();

// Get user favorites
router.get("/favorites/:userId", getUserFavorites);

// Add to favorites
router.post("/favorites/add", addFavorite);

// Remove from favorites
router.delete("/favorites/:userId/:mediaId", removeFavorite);

// Check if media is favorited
router.get("/favorites/:userId/:mediaId/check", isFavorited);

export default router;

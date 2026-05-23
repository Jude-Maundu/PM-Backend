import express from "express";
import {
  getUserFavorites,
  addFavorite,
  removeFavorite,
  isFavorited
} from "../controllers/favoriteController.js";
import { authenticate } from "../middlewares/auth.js";

const router = express.Router();

function ownsResource(paramName = "userId") {
  return (req, res, next) => {
    const callerId = (req.user?.userId || req.user?.id || req.user?._id)?.toString();
    const targetId = (req.params[paramName] || req.body[paramName])?.toString();
    if (callerId !== targetId && req.user?.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
}

// Get user favorites
router.get("/favorites/:userId", authenticate, ownsResource("userId"), getUserFavorites);

// Add to favorites (ownership enforced in controller via req.user)
router.post("/favorites/add", authenticate, addFavorite);

// Remove from favorites
router.delete("/favorites/:userId/:mediaId", authenticate, ownsResource("userId"), removeFavorite);

// Check if media is favorited
router.get("/favorites/:userId/:mediaId/check", authenticate, ownsResource("userId"), isFavorited);

export default router;

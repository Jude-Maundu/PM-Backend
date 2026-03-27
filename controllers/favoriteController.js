import Favorite from "../models/Favorite.js";
import Media from "../models/media.js";
import User from "../models/users.js";

// ==============================
// Get user favorites
// ==============================
export async function getUserFavorites(req, res) {
  try {
    const { userId } = req.params;

    // Validate user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Get all favorites for this user
    const favorites = await Favorite.find({ user: userId })
      .populate({
        path: "media",
        select: "title description price mediaType photographer fileUrl thumbnail downloads",
        populate: {
          path: "photographer",
          select: "username profilePicture"
        }
      })
      .sort({ addedAt: -1 });

    res.status(200).json(favorites);
  } catch (error) {
    console.error("Error fetching favorites:", error);
    res.status(500).json({ message: "Error fetching favorites", error: error.message });
  }
}

// ==============================
// Add media to favorites
// ==============================
export async function addFavorite(req, res) {
  try {
    const { userId, mediaId } = req.body;

    // Validate inputs
    if (!userId || !mediaId) {
      return res.status(400).json({ message: "userId and mediaId are required" });
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if media exists
    const media = await Media.findById(mediaId);
    if (!media) {
      return res.status(404).json({ message: "Media not found" });
    }

    // Check if already favorited
    const existingFavorite = await Favorite.findOne({ user: userId, media: mediaId });
    if (existingFavorite) {
      return res.status(400).json({ message: "Media already in favorites" });
    }

    // Create favorite
    const favorite = await Favorite.create({
      user: userId,
      media: mediaId
    });

    // Populate for response
    await favorite.populate({
      path: "media",
      select: "title description price mediaType photographer fileUrl thumbnail",
      populate: {
        path: "photographer",
        select: "username profilePicture"
      }
    });

    res.status(201).json({ message: "Added to favorites", favorite });
  } catch (error) {
    console.error("Error adding favorite:", error);
    res.status(500).json({ message: "Error adding favorite", error: error.message });
  }
}

// ==============================
// Remove media from favorites
// ==============================
export async function removeFavorite(req, res) {
  try {
    const { userId, mediaId } = req.params;

    // Validate inputs
    if (!userId || !mediaId) {
      return res.status(400).json({ message: "userId and mediaId are required" });
    }

    // Find and delete favorite
    const favorite = await Favorite.findOneAndDelete({ 
      user: userId, 
      media: mediaId 
    });

    if (!favorite) {
      return res.status(404).json({ message: "Favorite not found" });
    }

    res.status(200).json({ message: "Removed from favorites" });
  } catch (error) {
    console.error("Error removing favorite:", error);
    res.status(500).json({ message: "Error removing favorite", error: error.message });
  }
}

// ==============================
// Check if media is favorited
// ==============================
export async function isFavorited(req, res) {
  try {
    const { userId, mediaId } = req.params;

    const favorite = await Favorite.findOne({ user: userId, media: mediaId });
    
    res.status(200).json({ isFavorited: !!favorite });
  } catch (error) {
    console.error("Error checking favorite:", error);
    res.status(500).json({ message: "Error checking favorite", error: error.message });
  }
}

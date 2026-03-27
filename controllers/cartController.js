import mongoose from "mongoose";
import Cart from "../models/Cart.js";
import Media from "../models/media.js";

// ==============================
// Get user cart
// ==============================
export async function getCart(req, res) {
  try {
    const { userId } = req.params;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid userId format" });
    }

    let cart = await Cart.findOne({ user: userId });

    if (!cart) {
      cart = await Cart.create({ user: userId });
    }

    try {
      await cart.populate("items.media", "title price photographer fileUrl").populate("items.media.photographer", "username");
    } catch (popErr) {
      console.warn('[getCart] Populate warning (continuing with unpopulated cart):', popErr.message);
    }

    res.status(200).json(cart);
  } catch (error) {
    console.error('[getCart] Error:', error.message);
    res.status(500).json({ message: "Error fetching cart", error: error.message });
  }
}

// ==============================
// Add item to cart
// ==============================
export async function addToCart(req, res) {
  try {
    const { userId, mediaId } = req.body;

    if (!userId || !mediaId) {
      return res.status(400).json({ message: "userId and mediaId are required" });
    }

    // Validate MongoDB ObjectId format
    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(mediaId)) {
      return res.status(400).json({ message: "Invalid userId or mediaId format" });
    }

    const media = await Media.findById(mediaId);

    if (!media) {
      return res.status(404).json({ message: "Media not found. Please select a different item." });
    }

    let cart = await Cart.findOne({ user: userId });
    if (!cart) {
      cart = await Cart.create({ user: userId });
    }

    // Check if item already in cart
    const existingItem = cart.items.find((item) => {
      const itemMediaId = item.media?.toString?.() || item.media;
      return itemMediaId === mediaId;
    });
    
    if (existingItem) {
      return res.status(400).json({ message: "Item already in cart" });
    }

    cart.items.push({
      media: mediaId,
      price: media.price || 0,
    });

    cart.totalPrice = cart.items.reduce((sum, item) => sum + (item.price || 0), 0);
    await cart.save();
    
    // Populate with error handling
    try {
      await cart.populate("items.media", "title price photographer fileUrl").populate("items.media.photographer", "username");
    } catch (popErr) {
      console.warn('[addToCart] Populate warning (continuing with unpopulated cart):', popErr.message);
      // Continue without population
    }

    res.status(200).json({ message: "Item added to cart", cart });
  } catch (error) {
    console.error('[addToCart] Error:', error.message);
    res.status(500).json({ message: "Error adding to cart", error: error.message });
  }
}

// ==============================
// Remove item from cart
// ==============================
export async function removeFromCart(req, res) {
  try {
    const { userId, mediaId } = req.body;

    if (!userId || !mediaId) {
      return res.status(400).json({ message: "userId and mediaId are required" });
    }

    const cart = await Cart.findOne({ user: userId });
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    cart.items = cart.items.filter((item) => {
      const itemMediaId = item.media?.toString?.() || item.media;
      return itemMediaId !== mediaId;
    });
    
    cart.totalPrice = cart.items.reduce((sum, item) => sum + (item.price || 0), 0);
    await cart.save();
    
    try {
      await cart.populate("items.media", "title price photographer fileUrl");
    } catch (popErr) {
      console.warn('[removeFromCart] Populate warning (continuing with unpopulated cart):', popErr.message);
    }

    res.status(200).json({ message: "Item removed from cart", cart });
  } catch (error) {
    console.error('[removeFromCart] Error:', error.message);
    res.status(500).json({ message: "Error removing from cart", error: error.message });
  }
}

// ==============================
// Clear cart
// ==============================
export async function clearCart(req, res) {
  try {
    const { userId } = req.params;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid userId format" });
    }

    const cart = await Cart.findOne({ user: userId });
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    cart.items = [];
    cart.totalPrice = 0;
    await cart.save();

    res.status(200).json({ message: "Cart cleared", cart });
  } catch (error) {
    console.error('[clearCart] Error:', error.message);
    res.status(500).json({ message: "Error clearing cart", error: error.message });
  }
}

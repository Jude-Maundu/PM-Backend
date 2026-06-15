import mongoose from "mongoose";
import Cart from "../models/Cart.js";
import Media from "../models/media.js";
import Album from "../models/album.js";

function recalcTotal(cart) {
  const mediaTotal = cart.items.reduce((s, i) => s + (i.price || 0), 0);
  const albumTotal = cart.albumItems.reduce((s, i) => s + (i.price || 0), 0);
  cart.totalPrice = mediaTotal + albumTotal;
}

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
      cart = await Cart.create({ user: userId, items: [], albumItems: [] });
    }

    try {
      await cart.populate("items.media", "title price photographer fileUrl watermarkedUrl imageUrl");
      await cart.populate("albumItems.album", "name coverImage price mediaCount eventType photographer");
      await cart.populate("albumItems.album.photographer", "username");
    } catch (popErr) {
      console.warn("[getCart] Populate warning:", popErr.message);
    }

    res.status(200).json(cart);
  } catch (error) {
    console.error("[getCart] Error:", error.message);
    res.status(500).json({ message: "Error fetching cart" });
  }
}

// ==============================
// Add item to cart (media or album)
// ==============================
export async function addToCart(req, res) {
  try {
    const userId = (req.user?.userId || req.user?.id || req.user?._id)?.toString();
    const { mediaId, albumId } = req.body;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!mediaId && !albumId) {
      return res.status(400).json({ message: "mediaId or albumId is required" });
    }

    let cart = await Cart.findOne({ user: userId });
    if (!cart) {
      cart = await Cart.create({ user: userId, items: [], albumItems: [] });
    }

    // ── Album cart ──
    if (albumId) {
      if (!mongoose.Types.ObjectId.isValid(albumId)) {
        return res.status(400).json({ message: "Invalid albumId" });
      }

      const album = await Album.findById(albumId);
      if (!album) return res.status(404).json({ message: "Album not found" });

      const alreadyIn = cart.albumItems.some(
        i => (i.album?.toString?.() || i.album) === albumId
      );
      if (alreadyIn) {
        return res.status(400).json({ message: "Album already in cart" });
      }

      if ((album.purchasedBy || []).map(id => id.toString()).includes(userId)) {
        return res.status(400).json({ message: "You have already purchased this album" });
      }

      cart.albumItems.push({ album: albumId, price: album.price || 0 });
      recalcTotal(cart);
      await cart.save();

      try {
        await cart.populate("albumItems.album", "name coverImage price mediaCount eventType photographer");
      } catch { /* ignore */ }

      return res.status(200).json({ message: "Album added to cart", cart });
    }

    // ── Media cart ──
    if (!mongoose.Types.ObjectId.isValid(mediaId)) {
      return res.status(400).json({ message: "Invalid mediaId" });
    }

    const media = await Media.findById(mediaId);
    if (!media) return res.status(404).json({ message: "Media not found" });

    const existingItem = cart.items.find(
      item => (item.media?.toString?.() || item.media) === mediaId
    );
    if (existingItem) {
      return res.status(400).json({ message: "Item already in cart" });
    }

    cart.items.push({ media: mediaId, price: media.price || 0 });
    recalcTotal(cart);
    await cart.save();

    try {
      await cart.populate("items.media", "title price photographer fileUrl watermarkedUrl imageUrl");
    } catch { /* ignore */ }

    res.status(200).json({ message: "Item added to cart", cart });
  } catch (error) {
    console.error("[addToCart] Error:", error.message);
    res.status(500).json({ message: "Error adding to cart" });
  }
}

// ==============================
// Remove item from cart (media or album)
// ==============================
export async function removeFromCart(req, res) {
  try {
    const userId = (req.user?.userId || req.user?.id || req.user?._id)?.toString();
    const { mediaId, albumId } = req.body;

    const cart = await Cart.findOne({ user: userId });
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    if (albumId) {
      cart.albumItems = cart.albumItems.filter(
        i => (i.album?.toString?.() || i.album) !== albumId
      );
    } else if (mediaId) {
      cart.items = cart.items.filter(
        i => (i.media?.toString?.() || i.media) !== mediaId
      );
    } else {
      return res.status(400).json({ message: "mediaId or albumId is required" });
    }

    recalcTotal(cart);
    await cart.save();

    res.status(200).json({ message: "Item removed from cart", cart });
  } catch (error) {
    console.error("[removeFromCart] Error:", error.message);
    res.status(500).json({ message: "Error removing from cart" });
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
    cart.albumItems = [];
    cart.totalPrice = 0;
    await cart.save();

    res.status(200).json({ message: "Cart cleared", cart });
  } catch (error) {
    console.error("[clearCart] Error:", error.message);
    res.status(500).json({ message: "Error clearing cart" });
  }
}

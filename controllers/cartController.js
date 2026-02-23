import Cart from "../models/Cart.js";
import Media from "../models/media.js";

// ==============================
// Get user cart
// ==============================
export async function getCart(req, res) {
  try {
    const { userId } = req.params;
    let cart = await Cart.findOne({ user: userId }).populate("items.media", "title price photographer");

    if (!cart) {
      cart = await Cart.create({ user: userId });
    }

    res.status(200).json(cart);
  } catch (error) {
    res.status(500).json({ message: "Error fetching cart", error: error.message });
  }
}

// ==============================
// Add item to cart
// ==============================
export async function addToCart(req, res) {
  try {
    const { userId, mediaId } = req.body;
    const media = await Media.findById(mediaId);

    if (!media) return res.status(404).json({ message: "Media not found" });

    let cart = await Cart.findOne({ user: userId });
    if (!cart) {
      cart = await Cart.create({ user: userId });
    }

    // Check if item already in cart
    const existingItem = cart.items.find((item) => item.media.toString() === mediaId);
    if (existingItem) {
      return res.status(400).json({ message: "Item already in cart" });
    }

    cart.items.push({
      media: mediaId,
      price: media.price,
    });

    cart.totalPrice = cart.items.reduce((sum, item) => sum + item.price, 0);
    await cart.save();
    await cart.populate("items.media", "title price photographer");

    res.status(200).json({ message: "Item added to cart", cart });
  } catch (error) {
    res.status(500).json({ message: "Error adding to cart", error: error.message });
  }
}

// ==============================
// Remove item from cart
// ==============================
export async function removeFromCart(req, res) {
  try {
    const { userId, mediaId } = req.body;

    const cart = await Cart.findOne({ user: userId });
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    cart.items = cart.items.filter((item) => item.media.toString() !== mediaId);
    cart.totalPrice = cart.items.reduce((sum, item) => sum + item.price, 0);
    await cart.save();
    await cart.populate("items.media", "title price photographer");

    res.status(200).json({ message: "Item removed from cart", cart });
  } catch (error) {
    res.status(500).json({ message: "Error removing from cart", error: error.message });
  }
}

// ==============================
// Clear cart
// ==============================
export async function clearCart(req, res) {
  try {
    const { userId } = req.params;

    const cart = await Cart.findOne({ user: userId });
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    cart.items = [];
    cart.totalPrice = 0;
    await cart.save();

    res.status(200).json({ message: "Cart cleared", cart });
  } catch (error) {
    res.status(500).json({ message: "Error clearing cart", error: error.message });
  }
}

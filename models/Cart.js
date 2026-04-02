import mongoose from "mongoose";

const cartSchema = new mongoose.Schema({
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true
  },
  items: [
    {
      media: { type: mongoose.Schema.Types.ObjectId, ref: "Media", required: true },
      price: { type: Number, required: true },
      addedAt: { type: Date, default: Date.now }
    }
  ],
  totalPrice: { type: Number, default: 0 }
}, { timestamps: true });

// Schema-level indexes
cartSchema.index({ user: 1 }, { unique: true });
cartSchema.index({ "items.media": 1 });

const Cart = mongoose.model("Cart", cartSchema);
export default Cart;

import mongoose from "mongoose";
const { Schema } = mongoose;

const favoriteSchema = new Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  media: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Media",
    required: true
  },
  addedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Create a unique index to prevent duplicate favorites
favoriteSchema.index({ user: 1, media: 1 }, { unique: true });

const Favorite = mongoose.model("Favorite", favoriteSchema);

export default Favorite;

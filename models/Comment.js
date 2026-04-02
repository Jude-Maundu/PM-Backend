import mongoose from "mongoose";

const commentSchema = new mongoose.Schema({
  media: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Media",
    required: true
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  text: {
    type: String,
    required: true
  },
  rating: {
    type: Number,
    min: 1,
    max: 5
  },
  likes: {
    type: Number,
    default: 0
  },
  likedBy: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  ],
  replies: [
    {
      author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
      },
      text: {
        type: String,
        required: true
      },
      createdAt: {
        type: Date,
        default: Date.now
      }
    }
  ],
  isVerifiedPurchase: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

// Indexes for common queries
commentSchema.index({ media: 1, createdAt: -1 });
commentSchema.index({ author: 1, createdAt: -1 });

const Comment = mongoose.model("Comment", commentSchema);
export default Comment;

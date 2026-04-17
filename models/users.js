import mongoose from "mongoose";
const { Schema } = mongoose;


const userSchema = new Schema({
  username: { type: String, required: true },
  email: { type: String, required: true },
  password: { type: String, required: false }, // Not required for Google OAuth users
  googleId: { type: String, sparse: true }, // Google OAuth ID
  profilePicture: { type: String, default: "" },
  phoneNumber: { type: String, default: "" }, // For photographers to receive payments
  role: {
    type: String,
    enum: ["admin", "photographer", "user", "institution"],
    default: "user"
  },
  watermark: { type: String, default: "Relic Snap" }, // Photographer watermark text
  isActive: {
    type: Boolean,
    default: true
  },
  isBanned: {
    type: Boolean,
    default: false
  },
  isVerified: {
    type: Boolean,
    default: false // For email verification, Google users are pre-verified
  },
  followers: [{ type: Schema.Types.ObjectId, ref: "User" }],
  following: [{ type: Schema.Types.ObjectId, ref: "User" }],
  followersCount: { type: Number, default: 0 },
  followingCount: { type: Number, default: 0 },
  // Denormalized data for photographers
  location: { type: String, default: "" },
  bio: { type: String, default: "" },
  totalEarnings: { type: Number, default: 0 },
  totalUploads: { type: Number, default: 0 },
  totalDownloads: { type: Number, default: 0 },
}, { timestamps: true });

// Indexes for common queries
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ role: 1 });
userSchema.index({ createdAt: -1 });

const User = mongoose.model("User", userSchema);

export default User;
 
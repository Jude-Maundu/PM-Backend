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
    enum: ["admin", "reviewer", "support", "photographer", "user", "institution"],
    default: "user"
  },
  // Staff-specific: permissions granted by admin
  staffPermissions: {
    canApprovePhotos:    { type: Boolean, default: false },
    canVerifyUsers:      { type: Boolean, default: false },
    canViewOrders:       { type: Boolean, default: false },
    canManageWithdrawals:{ type: Boolean, default: false },
  },
  // Per-photographer custom commission rate (null = use platform default)
  commissionRate: { type: Number, default: null, min: 0, max: 100 },
  // KYC / identity verification
  kycStatus: {
    type: String,
    enum: ['not_submitted', 'pending', 'verified', 'rejected'],
    default: 'not_submitted',
  },
  kycRejectionReason: { type: String, default: '' },
  kycSubmittedAt: { type: Date },
  kycReviewedAt: { type: Date },
  watermark: { type: String, default: "PhotoMarket" },
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
  website: { type: String, default: "" },
  social: { type: Object, default: {} },
  skills: [{ type: String }],
  equipment: [{ type: String }],
  totalEarnings: { type: Number, default: 0 },
  totalUploads: { type: Number, default: 0 },
  totalDownloads: { type: Number, default: 0 },
  // Referral system
  referralCode: { type: String, unique: true, sparse: true },
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  referralEarnings: { type: Number, default: 0 },
  // Incremented on password change or account ban to invalidate existing JWTs
  tokenVersion: { type: Number, default: 0 },
}, { timestamps: true });

// Indexes for common queries
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ role: 1 });
userSchema.index({ createdAt: -1 });

const User = mongoose.model("User", userSchema);

export default User;
 
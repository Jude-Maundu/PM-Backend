import mongoose from "mongoose";

const { Schema } = mongoose;

const settingsSchema = new Schema(
  {
    siteName: { type: String, default: "PhotoMarket" },
    siteUrl: { type: String, default: "" },
    adminEmail: { type: String, default: "" },
    platformFee: { type: Number, default: 30 },
    minPayout: { type: Number, default: 1000 },
    maxUploadSize: { type: Number, default: 10 },
    allowedFormats: { type: [String], default: ["jpg", "jpeg", "png", "gif", "mp4", "webm"] },
    requireApproval: { type: Boolean, default: true },
    autoPublish: { type: Boolean, default: false },
    enableMpesa: { type: Boolean, default: true },
    enableWallet: { type: Boolean, default: true },
    maintenanceMode: { type: Boolean, default: false },
    registrationOpen: { type: Boolean, default: true },
    emailVerification: { type: Boolean, default: false },
    smtpHost: { type: String, default: "" },
    smtpPort: { type: Number, default: 587 },
    smtpUser: { type: String, default: "" },
    smtpPass: { type: String, default: "" },
    razorpayKey: { type: String, default: "" },
    stripeKey: { type: String, default: "" }
  },
  { timestamps: true }
);

// We only need one settings document in the database.
settingsSchema.statics.getSingleton = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

const Settings = mongoose.model("Settings", settingsSchema);

export default Settings;

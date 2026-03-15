import nodemailer from "nodemailer";
import Settings from "../models/settings.js";

let cachedSettings = null;

async function loadSettings(forceReload = false) {
  if (cachedSettings && !forceReload) return cachedSettings;
  cachedSettings = await Settings.getSingleton();
  return cachedSettings;
}

function sanitizeSettingsPayload(payload) {
  const allowedKeys = [
    "siteName",
    "siteUrl",
    "adminEmail",
    "platformFee",
    "minPayout",
    "maxUploadSize",
    "allowedFormats",
    "requireApproval",
    "autoPublish",
    "enableMpesa",
    "enableWallet",
    "maintenanceMode",
    "registrationOpen",
    "emailVerification",
    "smtpHost",
    "smtpPort",
    "smtpUser",
    "smtpPass",
    "razorpayKey",
    "stripeKey",
  ];

  const sanitized = {};
  for (const key of Object.keys(payload)) {
    if (allowedKeys.includes(key)) {
      sanitized[key] = payload[key];
    }
  }
  return sanitized;
}

async function getSettings(req, res) {
  try {
    const settings = await loadSettings();
    res.status(200).json(settings);
  } catch (error) {
    console.error("Error fetching settings:", error);
    res.status(500).json({ message: "Error fetching settings", error: error.message });
  }
}

async function updateSettings(req, res) {
  try {
    const payload = sanitizeSettingsPayload(req.body);
    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ message: "No valid settings provided" });
    }

    const settings = await loadSettings();
    Object.assign(settings, payload);
    await settings.save();

    cachedSettings = settings;
    res.status(200).json({ success: true, settings });
  } catch (error) {
    console.error("Error updating settings:", error);
    res.status(500).json({ message: "Error updating settings", error: error.message });
  }
}

async function updatePlatformFee(req, res) {
  try {
    const { fee } = req.body;
    if (typeof fee !== "number" || fee < 0 || fee > 100) {
      return res.status(400).json({ message: "fee must be a number between 0 and 100" });
    }

    const settings = await loadSettings();
    settings.platformFee = fee;
    await settings.save();

    cachedSettings = settings;
    res.status(200).json({ success: true, platformFee: settings.platformFee });
  } catch (error) {
    console.error("Error updating platform fee:", error);
    res.status(500).json({ message: "Error updating platform fee", error: error.message });
  }
}

async function updatePayout(req, res) {
  try {
    const { minPayout } = req.body;
    if (typeof minPayout !== "number" || minPayout < 0) {
      return res.status(400).json({ message: "minPayout must be a positive number" });
    }

    const settings = await loadSettings();
    settings.minPayout = minPayout;
    await settings.save();

    cachedSettings = settings;
    res.status(200).json({ success: true, minPayout: settings.minPayout });
  } catch (error) {
    console.error("Error updating min payout:", error);
    res.status(500).json({ message: "Error updating min payout", error: error.message });
  }
}

async function sendTestEmail(req, res) {
  try {
    const { to, smtpHost, smtpPort, smtpUser, smtpPass } = req.body;
    if (!to || !smtpHost || !smtpPort || !smtpUser || !smtpPass) {
      return res.status(400).json({ message: "Missing required email settings" });
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    const info = await transporter.sendMail({
      from: smtpUser,
      to,
      subject: "Test Email from PhotoMarket",
      text: "This is a test email from PhotoMarket.",
    });

    res.status(200).json({ success: true, message: "Test email sent", info });
  } catch (error) {
    console.error("Error sending test email:", error);
    res.status(500).json({ message: "Error sending test email", error: error.message });
  }
}

async function clearCache(req, res) {
  cachedSettings = null;
  res.status(200).json({ success: true });
}

async function setMaintenanceMode(req, res) {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ message: "Enabled must be a boolean" });
    }

    const settings = await loadSettings();
    settings.maintenanceMode = enabled;
    await settings.save();

    cachedSettings = settings;
    res.status(200).json({ success: true, maintenanceMode: settings.maintenanceMode });
  } catch (error) {
    console.error("Error setting maintenance mode:", error);
    res.status(500).json({ message: "Error setting maintenance mode", error: error.message });
  }
}

export {
  getSettings,
  updateSettings,
  updatePlatformFee,
  updatePayout,
  sendTestEmail,
  clearCache,
  setMaintenanceMode,
};

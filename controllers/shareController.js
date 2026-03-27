import jwt from "jsonwebtoken";
import QRCode from "qrcode";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import Media from "../models/media.js";
import ShareToken from "../models/ShareToken.js";
import User from "../models/users.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const QR_CODES_DIR = path.join(__dirname, "../uploads/qr-codes");

// Ensure QR codes directory exists
try {
  await fs.mkdir(QR_CODES_DIR, { recursive: true });
} catch (err) {
  console.error("Error creating QR codes directory:", err.message);
}

function generateToken() {
  return jwt.sign(
    { random: Math.random().toString(36).substring(7), timestamp: Date.now() },
    process.env.JWT_SECRET || "sharetoken-secret-key",
    { expiresIn: "7d" }
  );
}

function getBaseUrl(req) {
  return process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
}

// ==============================
// Generate Share Link with QR Code
// ==============================
export async function generateShareLink(req, res) {
  try {
    const { mediaId, maxDownloads = 10, expirationDays = 7, message = "" } = req.body;
    const userId = req.user?.userId || req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!mediaId) {
      return res.status(400).json({ success: false, message: "mediaId is required" });
    }

    // Verify media exists and user owns it
    const media = await Media.findById(mediaId).populate("photographer");
    if (!media) {
      return res.status(404).json({ success: false, message: "Media not found" });
    }

    const photographerId = media.photographer?._id?.toString() || media.photographer?.toString();
    if (photographerId !== userId.toString()) {
      return res.status(403).json({ success: false, message: "You can only share your own media" });
    }

    // Generate unique token
    const token = generateToken();
    const baseUrl = getBaseUrl(req);
    const shareUrl = `${baseUrl}/api/share/${token}`;
    const expiresAt = new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000);

    // Generate QR code
    const qrCodeFilename = `qr-${token}.png`;
    const qrCodePath = path.join(QR_CODES_DIR, qrCodeFilename);
    const qrCodeUrl = `${baseUrl}/uploads/qr-codes/${qrCodeFilename}`;

    await QRCode.toFile(qrCodePath, shareUrl, {
      errorCorrectionLevel: "H",
      type: "image/png",
      width: 300,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF"
      }
    });

    // Save to database
    const shareToken = await ShareToken.create({
      media: mediaId,
      createdBy: userId,
      token,
      shareUrl,
      qrCodePath: `/uploads/qr-codes/${qrCodeFilename}`,
      expiresAt,
      maxDownloads,
      description: message
    });

    console.log(`✅ Share link created: ${token} for media ${mediaId}`);

    res.status(201).json({
      success: true,
      message: "Share link generated",
      data: {
        token: shareToken.token,
        shareUrl: shareToken.shareUrl,
        qrCodeUrl,
        qrCodePath: shareToken.qrCodePath,
        expiresAt: shareToken.expiresAt,
        maxDownloads: shareToken.maxDownloads,
        createdAt: shareToken.createdAt
      }
    });
  } catch (error) {
    console.error("[generateShareLink] Error:", error.message);
    res.status(500).json({ success: false, message: "Error generating share link", error: error.message });
  }
}

// ==============================
// Access Shared Media
// ==============================
export async function accessSharedMedia(req, res) {
  try {
    const { token } = req.params;
    const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
    const userAgent = req.headers["user-agent"] || "unknown";

    // Find share token
    const shareToken = await ShareToken.findOne({ token })
      .populate("media", "title price photographer fileUrl")
      .populate("media.photographer", "username email")
      .populate("createdBy", "username email");

    if (!shareToken) {
      return res.status(404).json({ success: false, message: "Share link not found" });
    }

    // Check if active and not expired
    if (!shareToken.isActive) {
      return res.status(403).json({ success: false, message: "Share link has been revoked" });
    }

    if (new Date() > shareToken.expiresAt) {
      shareToken.isActive = false;
      await shareToken.save();
      return res.status(403).json({ success: false, message: "Share link has expired" });
    }

    // Log access
    shareToken.accessCount += 1;
    shareToken.accessLog.push({
      timestamp: new Date(),
      ip,
      userAgent,
      action: "view",
      userId: req.user?.userId || null
    });
    await shareToken.save();

    console.log(`📱 Share link accessed: ${token}`);

    res.status(200).json({
      success: true,
      message: "Shared media details",
      data: {
        media: shareToken.media,
        sharedBy: shareToken.createdBy,
        downloadUrl: `/api/share/${token}/download`,
        remainingDownloads: shareToken.maxDownloads - shareToken.downloadCount,
        accessCount: shareToken.accessCount,
        expiresAt: shareToken.expiresAt,
        message: shareToken.description
      }
    });
  } catch (error) {
    console.error("[accessSharedMedia] Error:", error.message);
    res.status(500).json({ success: false, message: "Error accessing share", error: error.message });
  }
}

// ==============================
// Download via Share Link
// ==============================
export async function downloadViaShareLink(req, res) {
  try {
    const { token } = req.params;
    const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
    const userAgent = req.headers["user-agent"] || "unknown";

    const shareToken = await ShareToken.findOne({ token }).populate("media");

    if (!shareToken) {
      return res.status(404).json({ success: false, message: "Share link not found" });
    }

    if (!shareToken.isActive) {
      return res.status(403).json({ success: false, message: "Share link has been revoked" });
    }

    if (new Date() > shareToken.expiresAt) {
      shareToken.isActive = false;
      await shareToken.save();
      return res.status(403).json({ success: false, message: "Share link has expired" });
    }

    if (shareToken.downloadCount >= shareToken.maxDownloads) {
      return res.status(403).json({
        success: false,
        message: `Download limit reached (${shareToken.maxDownloads} downloads max)`
      });
    }

    // Log download
    shareToken.downloadCount += 1;
    shareToken.accessLog.push({
      timestamp: new Date(),
      ip,
      userAgent,
      action: "download",
      userId: req.user?.userId || null
    });
    await shareToken.save();

    console.log(`⬇️ File downloaded via share link: ${token}`);

    // Return download URL
    res.status(200).json({
      success: true,
      message: "Download initiated",
      data: {
        downloadUrl: shareToken.media?.fileUrl || null,
        remainingDownloads: shareToken.maxDownloads - shareToken.downloadCount,
        expiresAt: shareToken.expiresAt
      }
    });
  } catch (error) {
    console.error("[downloadViaShareLink] Error:", error.message);
    res.status(500).json({ success: false, message: "Error downloading file", error: error.message });
  }
}

// ==============================
// Revoke Share Link
// ==============================
export async function revokeShareLink(req, res) {
  try {
    const { token } = req.params;
    const userId = req.user?.userId || req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const shareToken = await ShareToken.findOne({ token });

    if (!shareToken) {
      return res.status(404).json({ success: false, message: "Share link not found" });
    }

    if (shareToken.createdBy.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "You can only revoke your own shares" });
    }

    shareToken.isActive = false;
    shareToken.revokedAt = new Date();
    await shareToken.save();

    // Optionally delete QR code file
    if (shareToken.qrCodePath) {
      try {
        await fs.unlink(path.join(__dirname, "..", shareToken.qrCodePath));
        console.log(`🗑️ QR code file deleted: ${shareToken.qrCodePath}`);
      } catch (err) {
        console.warn("Could not delete QR code file:", err.message);
      }
    }

    console.log(`🔒 Share link revoked: ${token}`);

    res.status(200).json({ success: true, message: "Share link revoked" });
  } catch (error) {
    console.error("[revokeShareLink] Error:", error.message);
    res.status(500).json({ success: false, message: "Error revoking share", error: error.message });
  }
}

// ==============================
// List Active Shares
// ==============================
export async function listActiveShares(req, res) {
  try {
    const userId = req.user?.userId || req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const shares = await ShareToken.find({ createdBy: userId, isActive: true })
      .populate("media", "title fileUrl")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: "Active shares",
      data: shares.map((share) => ({
        token: share.token,
        shareUrl: share.shareUrl,
        qrCodeUrl: `/uploads/qr-codes/qr-${share.token}.png`,
        media: share.media,
        expiresAt: share.expiresAt,
        downloads: `${share.downloadCount}/${share.maxDownloads}`,
        accessCount: share.accessCount,
        createdAt: share.createdAt
      }))
    });
  } catch (error) {
    console.error("[listActiveShares] Error:", error.message);
    res.status(500).json({ success: false, message: "Error fetching shares", error: error.message });
  }
}

// ==============================
// Get Share Statistics
// ==============================
export async function getShareStats(req, res) {
  try {
    const { token } = req.params;
    const userId = req.user?.userId || req.user?.id;

    const shareToken = await ShareToken.findOne({ token });

    if (!shareToken) {
      return res.status(404).json({ success: false, message: "Share link not found" });
    }

    if (shareToken.createdBy.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "You can only view your own share stats" });
    }

    res.status(200).json({
      success: true,
      message: "Share statistics",
      data: {
        token: shareToken.token,
        accessCount: shareToken.accessCount,
        downloadCount: shareToken.downloadCount,
        maxDownloads: shareToken.maxDownloads,
        remainingDownloads: shareToken.maxDownloads - shareToken.downloadCount,
        isActive: shareToken.isActive,
        createdAt: shareToken.createdAt,
        expiresAt: shareToken.expiresAt,
        revokedAt: shareToken.revokedAt,
        accessLog: shareToken.accessLog
      }
    });
  } catch (error) {
    console.error("[getShareStats] Error:", error.message);
    res.status(500).json({ success: false, message: "Error fetching stats", error: error.message });
  }
}

import jwt from "jsonwebtoken";
import QRCode from "qrcode";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import Album from "../models/album.js";
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

function normalizeFileUrl(fileUrl) {
  if (!fileUrl) return fileUrl;
  if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
    return fileUrl;
  }
  const baseUrl = process.env.BASE_URL || process.env.FRONTEND_URL || "";
  return fileUrl.startsWith("/") ? `${baseUrl}${fileUrl}` : `${baseUrl}/${fileUrl}`;
}

// ==============================
// Generate Share Link with QR Code
// ==============================
export async function generateShareLink(req, res) {
  try {
    const { mediaId, albumId, maxDownloads = 10, expirationDays = 7, message = "" } = req.body;
    const userId = req.user?.userId || req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!mediaId && !albumId) {
      return res.status(400).json({ success: false, message: "Either mediaId or albumId is required" });
    }

    let sharedType = "media";
    let targetId = mediaId;
    let targetDoc = null;

    if (albumId) {
      sharedType = "album";
      targetId = albumId;
      targetDoc = await Album.findById(albumId);
      if (!targetDoc) {
        return res.status(404).json({ success: false, message: "Album not found" });
      }
      const photographerId = targetDoc.photographer?.toString();
      if (photographerId !== userId.toString()) {
        return res.status(403).json({ success: false, message: "You can only share your own album" });
      }
    } else {
      targetDoc = await Media.findById(mediaId).populate("photographer");
      if (!targetDoc) {
        return res.status(404).json({ success: false, message: "Media not found" });
      }
      const photographerId = targetDoc.photographer?._id?.toString() || targetDoc.photographer?.toString();
      if (photographerId !== userId.toString()) {
        return res.status(403).json({ success: false, message: "You can only share your own media" });
      }
    }

    // Generate unique token and frontend landing URL
    const token = generateToken();
    const frontendUrl = process.env.FRONTEND_URL || process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
    const shareUrl = `${frontendUrl}/share/${token}`;
    const expiresAt = new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000);

    // Generate QR code for frontend landing page
    const qrCodeFilename = `qr-${token}.png`;
    const qrCodePath = path.join(QR_CODES_DIR, qrCodeFilename);
    const qrCodeUrl = `${frontendUrl}/uploads/qr-codes/${qrCodeFilename}`;

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

    const shareToken = await ShareToken.create({
      media: mediaId || null,
      album: albumId || null,
      createdBy: userId,
      token,
      shareUrl,
      qrCodePath: `/uploads/qr-codes/${qrCodeFilename}`,
      expiresAt,
      maxDownloads,
      description: message,
      customMessage: message,
      shareType: sharedType
    });

    console.log(`✅ Share link created: ${token} for ${sharedType} ${targetId}`);

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
        createdAt: shareToken.createdAt,
        shareType: shareToken.shareType,
        targetId,
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

    const shareToken = await ShareToken.findOne({ token })
      .populate("media", "title price photographer fileUrl mediaType description")
      .populate("album", "name description coverImage price photographer isPrivate")
      .populate("createdBy", "username email");

    if (!shareToken) {
      return res.status(404).json({ success: false, message: "Share link not found" });
    }

    if (!shareToken.isActive) {
      return res.status(403).json({ success: false, message: "Share link has been revoked" });
    }

    if (shareToken.expiresAt && new Date() > shareToken.expiresAt) {
      shareToken.isActive = false;
      await shareToken.save();
      return res.status(403).json({ success: false, message: "Share link has expired" });
    }

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

    const responseData = {
      sharedBy: shareToken.createdBy,
      remainingDownloads: shareToken.maxDownloads - shareToken.downloadCount,
      accessCount: shareToken.accessCount,
      expiresAt: shareToken.expiresAt,
      message: shareToken.description || shareToken.customMessage,
      shareType: shareToken.shareType || (shareToken.album ? 'album' : 'media'),
      shareUrl: shareToken.shareUrl,
    };

    if (shareToken.media) {
      responseData.media = {
        ...shareToken.media.toObject(),
        fileUrl: normalizeFileUrl(shareToken.media.fileUrl)
      };
      responseData.downloadUrl = `/api/share/${token}/download`;
    }

    if (shareToken.album) {
      const albumDoc = typeof shareToken.album === "object" ? shareToken.album : await Album.findById(shareToken.album);
      if (albumDoc) {
        const items = await Media.find({ album: albumDoc._id })
          .populate("photographer", "username email");

        responseData.album = {
          ...albumDoc.toObject(),
          coverImage: normalizeFileUrl(albumDoc.coverImage),
          media: items.map((item) => ({
            ...item.toObject(),
            fileUrl: normalizeFileUrl(item.fileUrl)
          }))
        };
      }
    }

    res.status(200).json({
      success: true,
      message: "Shared resource details",
      data: responseData
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

    if (!shareToken.media) {
      return res.status(400).json({ success: false, message: "Download is only available for shared media items, not album shares" });
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

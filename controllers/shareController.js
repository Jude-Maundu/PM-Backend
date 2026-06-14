import jwt from "jsonwebtoken";
import QRCode from "qrcode";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import Album from "../models/album.js";
import Media from "../models/media.js";
import ShareToken from "../models/ShareToken.js";
import User from "../models/users.js";
import Payment from "../models/Payment.js";

// M-Pesa config for guest purchases
const _mpesaKey = process.env.MPESA_CONSUMER_KEY;
const _mpesaSecret = process.env.MPESA_SECRET_KEY;
const _mpesaShortCode = process.env.MPESA_BUSINESS_SHORTCODE || process.env.MPESA_SHORTCODE || "174379";
const _mpesaPasskey = process.env.MPESA_PASSKEY;
const _mpesaEnv = process.env.MPESA_ENV || process.env.MPESA_ENVIRONMENT || "sandbox";
const _backendUrl = process.env.BASE_URL || "https://pm-backend-f3b6.onrender.com";

async function _getMpesaToken() {
  const auth = Buffer.from(`${_mpesaKey}:${_mpesaSecret}`).toString("base64");
  const url = _mpesaEnv === "sandbox"
    ? "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials"
    : "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";
  const res = await axios.get(url, { headers: { Authorization: `Basic ${auth}` }, timeout: 10000 });
  return res.data.access_token;
}

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
    res.status(500).json({ success: false, message: "Error generating share link", error: process.env.NODE_ENV !== "production" ? error.message : undefined });
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
      const albumId = typeof shareToken.album === "object" ? shareToken.album._id : shareToken.album;
      const albumDoc = await Album.findById(albumId)
        .populate({
          path: "media",
          populate: { path: "photographer", select: "username email" }
        });

      if (albumDoc) {
        // Also catch any media that has album field set but isn't in the array yet
        const fromField = await Media.find({ album: albumId, _id: { $nin: albumDoc.media.map(m => m._id) } })
          .populate("photographer", "username email");

        const allMedia = [...albumDoc.media, ...fromField];

        responseData.album = {
          ...albumDoc.toObject(),
          coverImage: normalizeFileUrl(albumDoc.coverImage),
          media: allMedia.map((item) => ({
            ...item.toObject(),
            fileUrl: normalizeFileUrl(item.fileUrl),
            watermarkedUrl: normalizeFileUrl(item.watermarkedUrl)
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
    res.status(500).json({ success: false, message: "Error accessing share", error: process.env.NODE_ENV !== "production" ? error.message : undefined });
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
    res.status(500).json({ success: false, message: "Error downloading file", error: process.env.NODE_ENV !== "production" ? error.message : undefined });
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
    res.status(500).json({ success: false, message: "Error revoking share", error: process.env.NODE_ENV !== "production" ? error.message : undefined });
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
    res.status(500).json({ success: false, message: "Error fetching shares", error: process.env.NODE_ENV !== "production" ? error.message : undefined });
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
    res.status(500).json({ success: false, message: "Error fetching stats", error: process.env.NODE_ENV !== "production" ? error.message : undefined });
  }
}

// ==============================
// Quick Share Album with Buyer (Photographer creates private album share)
// ==============================
export async function shareAlbumWithBuyer(req, res) {
  try {
    const { albumId } = req.params;
    const { expirationDays = 7, maxDownloads = 50, message = "" } = req.body;
    const userId = req.user?.userId || req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!albumId) {
      return res.status(400).json({ success: false, message: "Album ID is required" });
    }

    // Verify album exists and belongs to the photographer
    const album = await Album.findById(albumId);
    if (!album) {
      return res.status(404).json({ success: false, message: "Album not found" });
    }

    if (album.photographer.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "You can only share your own albums" });
    }

    // Generate unique token and frontend landing URL
    const token = generateToken();
    const frontendUrl = process.env.FRONTEND_URL || process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
    const shareUrl = `${frontendUrl}/share/${token}`;
    const expiresAt = new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000);

    // Generate QR code for easy sharing
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
      media: null,
      album: albumId,
      createdBy: userId,
      token,
      shareUrl,
      qrCodePath: `/uploads/qr-codes/${qrCodeFilename}`,
      expiresAt,
      maxDownloads,
      description: message,
      customMessage: message,
      shareType: "album"
    });

    console.log(`✅ Album share created: ${token} for album ${albumId}`);

    res.status(201).json({
      success: true,
      message: "Album share link generated",
      data: {
        token: shareToken.token,
        shareUrl: shareToken.shareUrl,
        qrCodeUrl,
        qrCodePath: shareToken.qrCodePath,
        expiresAt: shareToken.expiresAt,
        maxDownloads: shareToken.maxDownloads,
        albumName: album.name,
        albumId,
        shareType: "album"
      }
    });
  } catch (error) {
    console.error("[shareAlbumWithBuyer] Error:", error.message);
    res.status(500).json({ success: false, message: "Error generating album share link", error: process.env.NODE_ENV !== "production" ? error.message : undefined });
  }
}

// ==============================
// Guest Purchase via Share Link (no auth required)
// ==============================
export async function purchaseViaShare(req, res) {
  try {
    const { token } = req.params;
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ success: false, message: "Phone number is required" });
    }

    const normalizedPhone = String(phone).replace(/[^0-9]/g, "").replace(/^0/, "254");
    if (!/^254\d{9}$/.test(normalizedPhone)) {
      return res.status(400).json({ success: false, message: "Invalid phone number. Use format 07XXXXXXXX" });
    }

    const shareToken = await ShareToken.findOne({ token })
      .populate("media", "title price fileUrl")
      .populate("album", "name _id");

    if (!shareToken) return res.status(404).json({ success: false, message: "Share link not found" });
    if (!shareToken.isActive) return res.status(403).json({ success: false, message: "Share link has been revoked" });
    if (shareToken.expiresAt && new Date() > shareToken.expiresAt) {
      return res.status(403).json({ success: false, message: "Share link has expired" });
    }

    // Calculate total price
    let amount = 0;
    let description = "Photo Purchase";
    let mediaItems = [];

    if (shareToken.shareType === "media" && shareToken.media) {
      amount = Number(shareToken.media.price) || 0;
      description = `Purchase: ${shareToken.media.title || "Photo"}`.substring(0, 25);
      mediaItems = [shareToken.media];
    } else if (shareToken.shareType === "album" && shareToken.album) {
      const items = await Media.find({ album: shareToken.album._id }).select("price _id title fileUrl");
      mediaItems = items;
      amount = items.reduce((sum, m) => sum + Number(m.price || 0), 0);
      description = `Album: ${shareToken.album.name || "Album"}`.substring(0, 25);
    }

    if (amount <= 0) {
      return res.status(400).json({ success: false, message: "This content has no price set. Contact the photographer." });
    }

    const tempId = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const payment = await Payment.create({
      buyer: null,
      guestPhone: normalizedPhone,
      media: shareToken.media?._id || null,
      cartItems: mediaItems.map(m => m._id),
      amount,
      adminShare: Number((amount * 0.10).toFixed(2)),
      photographerShare: Number((amount * 0.90).toFixed(2)),
      status: "pending",
      paymentMethod: "mpesa",
      checkoutRequestID: tempId,
      merchantRequestID: tempId,
      transactionId: tempId,
      phoneNumber: normalizedPhone,
      transactionDate: new Date()
    });

    let accessToken;
    try {
      accessToken = await _getMpesaToken();
    } catch (err) {
      payment.status = "failed";
      await payment.save();
      return res.status(500).json({ success: false, message: "M-Pesa service unavailable. Please try again later." });
    }

    const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);
    const password = Buffer.from(_mpesaShortCode + _mpesaPasskey + timestamp).toString("base64");
    const callbackUrl = process.env.MPESA_CALLBACK_URL || `${_backendUrl}/api/payments/callback`;

    const stkBody = {
      BusinessShortCode: _mpesaShortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.round(amount),
      PartyA: normalizedPhone,
      PartyB: _mpesaShortCode,
      PhoneNumber: normalizedPhone,
      CallBackURL: callbackUrl,
      AccountReference: "PHOTO_PURCHASE",
      TransactionDesc: description
    };

    const stkUrl = _mpesaEnv === "sandbox"
      ? "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest"
      : "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest";

    const stkResponse = await axios.post(stkUrl, stkBody, {
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      timeout: 30000
    });

    payment.checkoutRequestID = stkResponse.data.CheckoutRequestID;
    payment.merchantRequestID = stkResponse.data.MerchantRequestID;
    await payment.save();

    console.log(`✅ Guest STK push sent for share ${token}: KES ${amount} to ${normalizedPhone}`);

    return res.status(201).json({
      success: true,
      message: "M-Pesa payment prompt sent. Please check your phone.",
      checkoutRequestID: stkResponse.data.CheckoutRequestID,
      amount
    });
  } catch (error) {
    console.error("[purchaseViaShare] Error:", error.response?.data || error.message);
    return res.status(500).json({ success: false, message: "Failed to initiate payment", error: process.env.NODE_ENV !== "production" ? error.message : undefined });
  }
}

// ==============================
// Check Guest Payment Status (no auth required)
// ==============================
export async function checkGuestPaymentStatus(req, res) {
  try {
    const { token, requestId } = req.params;

    const payment = await Payment.findOne({ checkoutRequestID: requestId });
    if (!payment) {
      return res.status(404).json({ success: false, message: "Payment record not found" });
    }

    if (payment.status === "completed") {
      // Fetch downloadable URLs from the share token
      const shareToken = await ShareToken.findOne({ token })
        .populate("media", "title fileUrl price")
        .populate("album", "name _id");

      let downloadItems = [];
      if (shareToken?.shareType === "media" && shareToken.media) {
        downloadItems = [{ title: shareToken.media.title, fileUrl: normalizeFileUrl(shareToken.media.fileUrl) }];
      } else if (shareToken?.shareType === "album" && shareToken.album) {
        const items = await Media.find({ album: shareToken.album._id }).select("title fileUrl price");
        downloadItems = items.map(m => ({ title: m.title, fileUrl: normalizeFileUrl(m.fileUrl), price: m.price }));
      }

      return res.status(200).json({
        success: true,
        status: "completed",
        message: "Payment confirmed! Your downloads are ready.",
        downloadItems
      });
    }

    if (payment.status === "failed") {
      return res.status(200).json({ success: true, status: "failed", message: "Payment was declined. Please try again." });
    }

    return res.status(200).json({ success: true, status: "pending", message: "Waiting for payment confirmation..." });
  } catch (error) {
    console.error("[checkGuestPaymentStatus] Error:", error.message);
    return res.status(500).json({ success: false, message: "Error checking payment status" });
  }
}

// ==============================
// Guest Buy — Public Album or Single Photo (no auth, no share token)
// ==============================
export async function guestBuyPublicAlbum(req, res) {
  try {
    const { albumId, mediaId, phone } = req.body;

    if (!phone) return res.status(400).json({ success: false, message: "Phone number is required" });
    if (!albumId && !mediaId) return res.status(400).json({ success: false, message: "albumId or mediaId is required" });

    const normalizedPhone = String(phone).replace(/[^0-9]/g, "").replace(/^0/, "254");
    if (!/^254\d{9}$/.test(normalizedPhone)) {
      return res.status(400).json({ success: false, message: "Invalid phone number. Use format 07XXXXXXXX" });
    }

    let amount = 0;
    let description = "Photo Purchase";
    let mediaItems = [];

    if (albumId) {
      const album = await Album.findById(albumId);
      if (!album) return res.status(404).json({ success: false, message: "Album not found" });
      if (album.isPrivate) return res.status(403).json({ success: false, message: "This album requires a private share link to purchase" });

      if (album.price > 0) {
        amount = album.price;
        description = `Album: ${album.name}`.substring(0, 25);
        const items = await Media.find({ album: albumId }).select("_id title fileUrl price");
        mediaItems = items;
      } else {
        return res.status(400).json({ success: false, message: "This album has no price set. Browse individual photos to purchase." });
      }
    } else {
      const media = await Media.findById(mediaId).populate("album", "isPrivate");
      if (!media) return res.status(404).json({ success: false, message: "Photo not found" });
      if (media.album?.isPrivate) return res.status(403).json({ success: false, message: "This photo requires a private share link to purchase" });
      if (!media.price || media.price <= 0) return res.status(400).json({ success: false, message: "This photo has no price set" });
      amount = media.price;
      description = `Photo: ${media.title || "Untitled"}`.substring(0, 25);
      mediaItems = [media];
    }

    const tempId = `gp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const payment = await Payment.create({
      buyer: null,
      guestPhone: normalizedPhone,
      media: mediaId || null,
      cartItems: mediaItems.map(m => m._id),
      amount,
      adminShare: Number((amount * 0.10).toFixed(2)),
      photographerShare: Number((amount * 0.90).toFixed(2)),
      status: "pending",
      paymentMethod: "mpesa",
      checkoutRequestID: tempId,
      merchantRequestID: tempId,
      transactionId: tempId,
      phoneNumber: normalizedPhone,
      transactionDate: new Date()
    });

    let accessToken;
    try { accessToken = await _getMpesaToken(); }
    catch {
      payment.status = "failed"; await payment.save();
      return res.status(500).json({ success: false, message: "M-Pesa service unavailable. Please try again." });
    }

    const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);
    const password = Buffer.from(_mpesaShortCode + _mpesaPasskey + timestamp).toString("base64");
    const callbackUrl = process.env.MPESA_CALLBACK_URL || `${_backendUrl}/api/payments/callback`;

    const stkResponse = await axios.post(
      _mpesaEnv === "sandbox"
        ? "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest"
        : "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      {
        BusinessShortCode: _mpesaShortCode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: Math.round(amount),
        PartyA: normalizedPhone,
        PartyB: _mpesaShortCode,
        PhoneNumber: normalizedPhone,
        CallBackURL: callbackUrl,
        AccountReference: "RELIC_SNAP",
        TransactionDesc: description
      },
      { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, timeout: 30000 }
    );

    payment.checkoutRequestID = stkResponse.data.CheckoutRequestID;
    payment.merchantRequestID = stkResponse.data.MerchantRequestID;
    await payment.save();

    return res.status(201).json({
      success: true,
      message: "M-Pesa payment prompt sent. Check your phone.",
      checkoutRequestID: stkResponse.data.CheckoutRequestID,
      amount
    });
  } catch (error) {
    console.error("[guestBuyPublicAlbum] Error:", error.response?.data || error.message);
    return res.status(500).json({ success: false, message: "Payment initiation failed. Please try again." });
  }
}

// ==============================
// Check Direct Guest Payment Status (no share token needed)
// ==============================
export async function checkDirectGuestStatus(req, res) {
  try {
    const { requestId } = req.params;
    const payment = await Payment.findOne({ checkoutRequestID: requestId }).populate("cartItems", "title fileUrl price");

    if (!payment) return res.status(404).json({ success: false, message: "Payment not found" });

    if (payment.status === "completed") {
      const downloadItems = (payment.cartItems || []).map(m => ({
        title: m.title || "Photo",
        fileUrl: normalizeFileUrl(m.fileUrl),
        price: m.price
      }));
      return res.status(200).json({ success: true, status: "completed", downloadItems });
    }

    if (payment.status === "failed") {
      return res.status(200).json({ success: true, status: "failed", message: "Payment declined. Please try again." });
    }

    return res.status(200).json({ success: true, status: "pending" });
  } catch (error) {
    console.error("[checkDirectGuestStatus] Error:", error.message);
    return res.status(500).json({ success: false, message: "Error checking payment status" });
  }
}

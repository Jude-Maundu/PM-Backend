import mongoose from "mongoose";
import Media from "../models/media.js";
import Album from "../models/album.js";
import EventAccess from "../models/EventAccess.js";
import Payment from "../models/Payment.js";
import User from "../models/users.js";
import Favorite from "../models/Favorite.js";

function normalizeError(res, statusCode, message) {
  return res.status(statusCode).json({ success: false, message });
}

function extractAuthUserId(req) {
  const sourceId =
    req.user?.userId ||
    req.user?.id ||
    req.user?._id ||
    req.user?.uid ||
    req.query?.userId ||
    req.query?.user ||
    req.body?.userId ||
    req.body?.user;

  if (!sourceId) return null;
  return sourceId.toString().trim();
}

function validateObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// Normalize file URLs stored as absolute filesystem paths (e.g., `/opt/render/.../uploads/...`) to a web-accessible path.
function normalizeFileUrl(fileUrl) {
  if (!fileUrl) return fileUrl;

  const trimmed = fileUrl.toString().trim();
  if (/^(https?:)?\/\//i.test(trimmed)) {
    // Cloudinary or any HTTP(S) URL should be used as is.
    return trimmed;
  }

  const idx = trimmed.indexOf("/uploads/");
  if (idx !== -1) return trimmed.slice(idx);

  // If it's a relative path or just filename, assume it's in /uploads/photos/
  if (!trimmed.startsWith('/')) {
    return `/uploads/photos/${trimmed}`;
  }

  return trimmed;
}

// ==============================
// Get all media
// ==============================
export async function getAllMedia(req, res) {
  try {
    const authUserId = extractAuthUserId(req);
    const isAdmin = req.user?.role === 'admin';

    const query = isAdmin
      ? {}
      : authUserId
        ? { $or: [{ isPrivate: false }, { photographer: authUserId }] }
        : { isPrivate: false };

    const media = await Media.find(query)
      .populate("photographer", "username email");

    // Normalize fileUrl for client consumption (some entries store absolute paths)
    const normalized = media.map((m) => ({
      ...m.toObject(),
      fileUrl: normalizeFileUrl(m.fileUrl)
    }));

    res.status(200).json({ success: true, media: normalized });

  } catch (error) {
    console.error("[getAllMedia] Error", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
}

// ==============================
// Get one media
// ==============================
export async function getOneMedia(req, res) {
  try {
    const { id } = req.params;
    const authUserId = extractAuthUserId(req);
    const isAdmin = req.user?.role === 'admin';

    if (!validateObjectId(id)) {
      return normalizeError(res, 400, "Invalid media ID format");
    }

    const media = await Media.findById(id)
      .populate("photographer", "username email");

    if (!media) return normalizeError(res, 404, "Media not found");

    const isOwner = String(media.photographer?._id || media.photographer) === String(authUserId);
    if (media.isPrivate && !isOwner && !isAdmin) {
      return normalizeError(res, 403, "This media is private");
    }

    const normalized = {
      ...media.toObject(),
      fileUrl: normalizeFileUrl(media.fileUrl)
    };

    res.status(200).json({ success: true, media: normalized });

  } catch (error) {
    console.error("[getOneMedia] Error", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
}

// ==============================
// Get authenticated photographer's own media
// ==============================
export async function getMyMedia(req, res) {
  try {
    const authUserId = extractAuthUserId(req);
    if (!authUserId) {
      return normalizeError(res, 401, "Authenticated user id required");
    }

    const user = await User.findById(authUserId).lean();
    if (!user) {
      return normalizeError(res, 401, "Authenticated user not found");
    }

    if (user.isBanned) {
      return normalizeError(res, 403, "Account is banned");
    }
    if (user.isActive === false) {
      return normalizeError(res, 403, "Account is not active");
    }

    const media = await Media.find({ photographer: authUserId })
      .populate("photographer", "username email");

    const normalized = media.map((m) => ({
      ...m.toObject(),
      fileUrl: normalizeFileUrl(m.fileUrl)
    }));

    res.status(200).json(normalized);
  } catch (error) {
    console.error("[getMyMedia] Error", error.message);
    return normalizeError(res, 500, error.message);
  }
}

// ==============================
// Create event access token (photographer shares to a buyer)
// ==============================
export async function createEventAccess(req, res) {
  try {
    const { albumId } = req.params;

    // Support both POST (body) and GET (query) for creating event access.
    const {
      buyerId: bodyBuyerId,
      buyerEmail: bodyBuyerEmail,
      email: bodyEmail,
      buyerPhone: bodyBuyerPhone,
      expiresInMinutes: bodyExpiresInMinutes
    } = req.body;

    const {
      buyerId: queryBuyerId,
      buyerEmail: queryBuyerEmail,
      email: queryEmail,
      buyerPhone: queryBuyerPhone,
      expiresInMinutes: queryExpiresInMinutes
    } = req.query;

    const buyerId = bodyBuyerId || queryBuyerId;
    const buyerEmail = bodyBuyerEmail || queryBuyerEmail;
    const email = bodyEmail || queryEmail;
    const buyerPhone = bodyBuyerPhone || queryBuyerPhone;
    const expiresInMinutes = bodyExpiresInMinutes ?? queryExpiresInMinutes ?? 60;

    // Photographer identity is derived from the authenticated JWT
    const photographerId = req.user?.userId;

    // Allow `email` as an alias for `buyerEmail` to simplify frontend usage
    const resolvedBuyerEmail = buyerEmail || email;

    // Validate required inputs
    if (!albumId || !photographerId) {
      return res.status(400).json({ message: "albumId and authenticated photographer are required" });
    }

    if (!buyerId && !resolvedBuyerEmail && !buyerPhone) {
      return res.status(400).json({ message: "buyerId, buyerEmail (or email), or buyerPhone is required" });
    }

    const album = await Album.findById(albumId);
    if (!album) return res.status(404).json({ message: "Album (event) not found" });

    console.log("[createEventAccess] photographerId", photographerId, "album.photographer", album.photographer?.toString());
    if (album.photographer.toString() !== photographerId) {
      console.warn("[createEventAccess] unauthorized album access", { albumId, photographerId, owner: album.photographer?.toString() });
      return res.status(403).json({ message: "Unauthorized: you don't own this album" });
    }

    // Resolve buyer by id/email/phone
    let buyer = null;
    if (buyerId) {
      buyer = await User.findById(buyerId);
    } else if (resolvedBuyerEmail) {
      buyer = await User.findOne({ email: resolvedBuyerEmail });
    } else if (buyerPhone) {
      buyer = await User.findOne({ phoneNumber: buyerPhone });
    }

    if (!buyer) {
      return res.status(404).json({ message: "Buyer not found. Provide a valid buyerId, buyerEmail (or email), or buyerPhone." });
    }

    // Use buyer email in the token (avoids needing to expose Mongo ID to the frontend)
    const tokenSource = `${albumId}:${buyer.email}:${Date.now()}`;
    const token = Buffer.from(tokenSource).toString("base64");
    const expiresAt = new Date(Date.now() + Number(expiresInMinutes) * 60000);

    const eventAccess = await EventAccess.create({
      album: albumId,
      photographer: photographerId,
      buyer: buyer._id,
      token,
      expiresAt,
      isActive: true
    });

    const accessLink = `${process.env.FRONTEND_URL || "http://localhost:3000"}/events/${albumId}/access/${token}`;

    res.status(201).json({
      message: "Event access token created",
      eventAccess,
      accessLink
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ==============================
// Get album media via event token
// ==============================
export async function getEventMediaByToken(req, res) {
  try {
    const { albumId, token } = req.params;

    if (!albumId || !token) {
      return res.status(400).json({ message: "albumId and token are required" });
    }

    const accessRecord = await EventAccess.findOne({
      album: albumId,
      token,
      isActive: true,
      expiresAt: { $gt: new Date() }
    }).populate("buyer photographer");

    if (!accessRecord) {
      return res.status(403).json({ message: "Invalid or expired event access token" });
    }

    const media = await Media.find({ album: albumId })
      .populate("photographer", "username email");

    const albumData = await Album.findById(albumId)
      .populate("photographer", "username email");

    res.status(200).json({
      album: albumData || { _id: albumId },
      buyer: accessRecord.buyer,
      photographer: accessRecord.photographer,
      media,
      canPurchase: true
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ==============================
// Create Album (event)
// ==============================
export async function createAlbum(req, res) {
  try {
    const { name, description, price, isPrivate } = req.body;
    const photographerId = req.user?.userId;

    console.log("[createAlbum] Received request", {
      body: req.body,
      file: req.file ? { filename: req.file.filename, size: req.file.size } : null,
      photographerId,
      user: req.user,
    });

    if (!name) {
      return res.status(400).json({ message: "Album name is required" });
    }

    if (!photographerId) {
      console.warn("[createAlbum] Missing photographerId", { user: req.user });
      return res.status(401).json({ message: "Authentication required" });
    }

    // Handle cover image: uploaded file takes priority
    let coverImage = "";
    if (req.file) {
      coverImage = req.file.secure_url || req.file.url || req.file.path || req.file.filename || "";
      if (coverImage && !coverImage.startsWith('http') && !coverImage.startsWith('/')) {
        coverImage = `/uploads/photos/${coverImage}`;
      }
      console.log("[createAlbum] Using uploaded file:", coverImage);
    } else if (req.body.coverImage) {
      coverImage = req.body.coverImage;
      console.log("[createAlbum] Using URL from body:", coverImage);
    }

    const parsedPrice = Number(price ?? 0);
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ message: "Album price must be a valid non-negative number" });
    }

    const parsedPrivate = String(isPrivate).toLowerCase() === 'true';

    const album = await Album.create({
      name,
      description: description || "",
      coverImage,
      price: parsedPrice,
      photographer: photographerId,
      isPrivate: parsedPrivate
    });

    console.log("[createAlbum] Album created successfully", { albumId: album._id, name, photographer: photographerId });
    res.status(201).json({ message: "Album created", album });
  } catch (error) {
    console.error("[createAlbum] Error creating album", {
      message: error.message,
      stack: error.stack,
      body: req.body,
      user: req.user,
    });
    res.status(500).json({ message: error.message });
  }
}

// ==============================
// Get media with download protection (requires buyer has completed purchase)
// ==============================
export async function getProtectedMedia(req, res) {
  try {
    const { id } = req.params;

    console.log(`[getProtectedMedia] request mediaId=${id} endpoint=/api/media/${id}/protected`);

    if (!validateObjectId(id)) {
      return normalizeError(res, 400, "Invalid media ID format");
    }

    const authUserId = extractAuthUserId(req);
    if (!authUserId) {
      return normalizeError(res, 401, "Authenticated user id required for protected media");
    }

    const requestUserId = (req.query?.userId || req.query?.user || req.body?.userId || req.body?.user)?.toString().trim();
    if (requestUserId && requestUserId !== authUserId) {
      console.warn("[getProtectedMedia] query userId mismatch", { authUserId, requestUserId, authUserRole: req.user?.role });
      return normalizeError(res, 403, "Authenticated user id mismatch");
    }

    const user = await User.findById(authUserId).lean();
    if (!user) {
      return normalizeError(res, 401, "Authenticated user not found");
    }

    if (user.isBanned) {
      return normalizeError(res, 403, "Account is banned");
    }

    if (user.isActive === false) {
      return normalizeError(res, 403, "Account is not active");
    }

    const media = await Media.findById(id)
      .populate("photographer", "username email");

    if (!media) return normalizeError(res, 404, "Media not found");

    const photographerId = media.photographer?._id?.toString() || media.photographer?.toString();
    const isAdmin = req.user?.role === "admin";
    const isPhotographer = photographerId === authUserId;
    const isFree = !media.price || media.price <= 0;

    console.log("[getProtectedMedia] permission check", { 
      authUserId, 
      isAdmin, 
      isPhotographer, 
      isFree, 
      mediaId: id,
      mediaPrice: media.price,
      photographerId 
    });

    if (!isAdmin && !isPhotographer && !isFree) {
      const payment = await Payment.findOne({
        media: id,
        buyer: authUserId,
        status: { $in: ["completed", "pending"] }
      });

      console.log("[getProtectedMedia] payment check", { 
        found: !!payment, 
        paymentStatus: payment?.status,
        paymentId: payment?._id 
      });

      if (!payment) {
        return normalizeError(res, 403, "Download not permitted. You need to purchase this media first.");
      }
    }

    const downloadToken = Buffer.from(`${id}:${authUserId}:${Date.now()}`).toString("base64");
    const signedUrl = `/api/media/${id}/download?token=${encodeURIComponent(downloadToken)}&user=${encodeURIComponent(authUserId)}`;

    res.status(200).json({
      success: true,
      media: {
        ...media.toObject(),
        fileUrl: normalizeFileUrl(media.fileUrl)
      },
      downloadUrl: signedUrl,
      canDownload: true,
    });
  } catch (error) {
    console.error("[getProtectedMedia] Error", error.message);
    return normalizeError(res, 500, error.message);
  }
}

// ==============================
// Allow downloading after token check (secure link)
// ==============================
export async function downloadMedia(req, res) {
  try {
    const { id } = req.params;
    const { token, user: queryUserId } = req.query;

    console.log(`[downloadMedia] request mediaId=${id} queryUserId=${queryUserId}`);

    if (!token || !queryUserId) {
      return normalizeError(res, 400, "Download token and user required");
    }

    if (!validateObjectId(id)) {
      return normalizeError(res, 400, "Invalid media ID format");
    }

    const authUserId = extractAuthUserId(req);
    if (!authUserId) {
      return normalizeError(res, 401, "Authenticated user id required");
    }

    if (queryUserId.toString().trim() !== authUserId) {
      console.warn("[downloadMedia] user mismatch", { authUserId, queryUserId });
      return normalizeError(res, 403, "Authenticated user mismatch");
    }

    const decoded = Buffer.from(token.toString(), "base64").toString("utf-8");
    const [mediaId, tokenUserId, timestamp] = decoded.split(":");

    if (mediaId !== id || tokenUserId !== authUserId) {
      console.warn("[downloadMedia] token mismatch", { mediaId, tokenUserId, id, authUserId });
      return normalizeError(res, 403, "Invalid download token");
    }

    const isExpired = (Date.now() - Number(timestamp)) > 10 * 60 * 1000;
    if (isExpired) {
      return normalizeError(res, 403, "Download token has expired");
    }

    const media = await Media.findById(id);
    if (!media) return normalizeError(res, 404, "Media not found");

    const photographerId = media.photographer?._id?.toString() || media.photographer?.toString();
    const isAdmin = req.user?.role === "admin";
    const isPhotographer = photographerId === authUserId;
    const isFree = !media.price || media.price <= 0;

    if (!isAdmin && !isPhotographer && !isFree) {
      const payment = await Payment.findOne({
        media: id,
        buyer: authUserId,
        status: "completed"
      });

      if (!payment) {
        return normalizeError(res, 403, "You need to purchase this media first");
      }
    }

    await Media.findByIdAndUpdate(id, { $inc: { downloads: 1 } });

    // Get the download URL
    let downloadUrl = normalizeFileUrl(media.fileUrl);
    
    // If it's a Cloudinary URL or external URL, redirect directly
    if (downloadUrl.startsWith("http")) {
      return res.redirect(downloadUrl);
    }
    
    // For local files, construct full URL
    if (!downloadUrl.startsWith("/")) {
      downloadUrl = "/" + downloadUrl;
    }
    
    // Send file or redirect to local path
    const absolutePath = downloadUrl.replace(/^\/uploads/, "./uploads");
    try {
      return res.sendFile(absolutePath, { root: process.cwd() });
    } catch (err) {
      // Fallback to redirect if file not found
      return res.redirect(downloadUrl);
    }
  } catch (error) {
    console.error("[downloadMedia] Error", error.message);
    return normalizeError(res, 500, error.message);
  }
}

// ==============================
// Create media (photo/video) - Cloudinary
// ==============================
export async function createMedia(req, res) {
  try {
    const { title, description, price, mediaType, album, isPrivate } = req.body;
    
    // Extract authenticated user ID
    const authUserId = extractAuthUserId(req);
    if (!authUserId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "File (image/video) is required" });
    }

    if (!title) {
      return res.status(400).json({ message: "Title is required" });
    }

    // Determine file URL from upload middleware (Cloudinary or local disk)
    let fileUrl = null;
    if (req.file) {
      // Cloudinary (with multer-storage-cloudinary) provides secure_url/path
      fileUrl = req.file.secure_url || req.file.url || req.file.path || req.file.filename;

      // If local disk upload returns only filename, build express URL
      if (fileUrl && !fileUrl.startsWith('http') && !fileUrl.startsWith('/')) {
        fileUrl = `/uploads/photos/${fileUrl}`;
      }

      // Fallback to the old local path format
      if (!fileUrl && req.file.filename) {
        fileUrl = `/uploads/photos/${req.file.filename}`;
      }
    }

    if (!fileUrl) {
      return res.status(500).json({ message: 'Unable to resolve uploaded media URL' });
    }

    const parsedPrice = Number(price ?? 0);
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ message: "Media price must be a valid non-negative number" });
    }

    const parsedPrivate = String(isPrivate).toLowerCase() === 'true';

    const media = await Media.create({
      title,
      description,
      price: parsedPrice,
      fileUrl,
      mediaType,
      album: album || null,
      photographer: authUserId,
      isPrivate: parsedPrivate,
    });

    res.status(201).json(media);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ==============================
// Bulk upload media into album
// ==============================
export async function bulkUploadAlbumMedia(req, res) {
  try {
    const { album } = req.body;
    
    // Extract authenticated user ID
    const authUserId = extractAuthUserId(req);
    if (!authUserId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    // If album is specified, verify ownership
    let albumDoc = null;
    if (album) {
      albumDoc = await Album.findById(album);
      if (!albumDoc) {
        return res.status(404).json({ message: "Album not found" });
      }
      if (String(albumDoc.photographer) !== String(authUserId)) {
        return res.status(403).json({ message: "You are not authorized to add media to this album" });
      }
    }

    const uploadPrice = Number(req.body.price ?? 0);
    if (Number.isNaN(uploadPrice) || uploadPrice < 0) {
      return res.status(400).json({ message: "Uploaded media price must be a valid non-negative number" });
    }

    const parsedPrivate = String(req.body.isPrivate).toLowerCase() === 'true';
    const inheritedPrivate = albumDoc?.isPrivate === true;

    const uploadedMedia = await Promise.all(req.files.map(async (file) => {
      let fileUrl = file.secure_url || file.url || file.path || file.filename;
      if (fileUrl && !fileUrl.startsWith("http") && !fileUrl.startsWith("/")) {
        fileUrl = `/uploads/photos/${fileUrl}`;
      }

      const media = await Media.create({
        title: file.originalname || file.filename || "Untitled",
        description: req.body.description || `Uploaded on ${new Date().toLocaleDateString()}`,
        price: uploadPrice,
        fileUrl,
        mediaType: file.mimetype?.startsWith("video") ? "video" : "photo",
        album: album || null,
        photographer: authUserId,
        isPrivate: inheritedPrivate || parsedPrivate,
      });

      if (album) {
        await Album.findByIdAndUpdate(album, {
          $push: { media: media._id },
          $inc: { mediaCount: 1 }
        });
      }

      return media;
    }));

    res.status(201).json({ success: true, media: uploadedMedia });
  } catch (error) {
    console.error("[bulkUploadAlbumMedia] Error", error);
    res.status(500).json({ message: error.message });
  }
}

// ==============================
// Delete media
// ==============================
export async function deleteMedia(req, res) {
  try {
    const authUserId = extractAuthUserId(req);
    if (!authUserId) {
      return normalizeError(res, 401, "Authentication required");
    }

    const media = await Media.findById(req.params.id);
    if (!media) return normalizeError(res, 404, "Media not found");

    if (req.user?.role !== 'admin' && String(media.photographer) !== String(authUserId)) {
      return normalizeError(res, 403, "You are not allowed to delete this media");
    }

    await Media.findByIdAndDelete(req.params.id);

    res.status(200).json({ message: "Media deleted successfully" });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ==============================
// Update media
// ==============================
export async function updateMedia(req, res) {
  try {
    const authUserId = extractAuthUserId(req);
    if (!authUserId) {
      return normalizeError(res, 401, "Authentication required");
    }

    const media = await Media.findById(req.params.id);
    if (!media) return normalizeError(res, 404, "Media not found");

    if (req.user?.role !== 'admin' && String(media.photographer) !== String(authUserId)) {
      return normalizeError(res, 403, "You are not allowed to edit this media");
    }

    const updatePayload = { ...req.body };

    if (req.file) {
      let fileUrl = req.file.secure_url || req.file.url || req.file.path || req.file.filename;
      if (fileUrl && !fileUrl.startsWith('http') && !fileUrl.startsWith('/')) {
        fileUrl = `/uploads/photos/${fileUrl}`;
      }
      if (fileUrl) {
        updatePayload.fileUrl = fileUrl;
      }
    }

    if (updatePayload.isPrivate !== undefined) {
      updatePayload.isPrivate = String(updatePayload.isPrivate).toLowerCase() === 'true';
    }

    const updatedMedia = await Media.findByIdAndUpdate(req.params.id, updatePayload, { new: true });

    res.status(200).json(updatedMedia);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ==============================
// Get media price (authenticated users)
// ==============================
export async function getMediaPrice(req, res) {
  try {
    const { id } = req.params;
    const authUserId = extractAuthUserId(req);

    if (!validateObjectId(id)) {
      return normalizeError(res, 400, "Invalid media ID format");
    }

    const media = await Media.findById(id);
    if (!media) return normalizeError(res, 404, "Media not found");

    // Allow access if user is the photographer or if media is public
    const isOwner = media.photographer.toString() === authUserId;
    const isPublic = !media.price || media.price <= 0; // Free media is public

    if (!isOwner && !isPublic) {
      return normalizeError(res, 403, "Access denied: Price information not available");
    }

    res.status(200).json({ price: media.price || 0 });

  } catch (error) {
    console.error("[getMediaPrice] Error", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
}

// ==============================
// Update media price (photographer only)
// ==============================
export async function updateMediaPrice(req, res) {
  try {
    const { id } = req.params;
    const { price } = req.body;

    // Extract authenticated user ID
    const authUserId = extractAuthUserId(req);
    if (!authUserId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const media = await Media.findById(id);
    if (!media) return res.status(404).json({ message: "Media not found" });

    // Verify photographer owns this media
    if (req.user?.role !== 'admin' && String(media.photographer) !== String(authUserId)) {
      return res.status(403).json({ message: "Unauthorized: You don't own this media" });
    }

    const parsedPrice = Number(price);
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ message: "Price must be a valid non-negative number" });
    }

    media.price = parsedPrice;
    await media.save();

    res.status(200).json({ message: "Price updated", media });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ==============================
// Get all albums
// ==============================
export async function getAlbums(req, res) {
  try {
    const authUserId = extractAuthUserId(req);
    const isAdmin = req.user?.role === 'admin';

    const query = isAdmin
      ? {}
      : authUserId
        ? { $or: [{ isPrivate: false }, { photographer: authUserId }] }
        : { isPrivate: false };

    const albums = await Album.find(query)
      .populate("photographer", "username profilePicture")
      .sort({ createdAt: -1 });

    res.status(200).json(albums);
  } catch (error) {
    console.error("Error fetching albums:", error);
    res.status(500).json({ message: "Error fetching albums", error: error.message });
  }
}

// ==============================
// Get single album
// ==============================
export async function getAlbum(req, res) {
  try {
    const { albumId } = req.params;
    const authUserId = extractAuthUserId(req);
    const isAdmin = req.user?.role === 'admin';

    const album = await Album.findById(albumId)
      .populate("photographer", "username profilePicture email");

    if (!album) {
      return res.status(404).json({ message: "Album not found" });
    }

    const isOwner = String(album.photographer._id || album.photographer) === String(authUserId);
    if (album.isPrivate && !isOwner && !isAdmin) {
      return res.status(403).json({ message: "This album is private" });
    }

    // Get media in this album
    const media = await Media.find({ album: albumId })
      .populate("photographer", "username");

    res.status(200).json({ album, media });
  } catch (error) {
    console.error("Error fetching album:", error);
    res.status(500).json({ message: "Error fetching album", error: error.message });
  }
}

export async function updateAlbum(req, res) {
  try {
    const { albumId } = req.params;
    const photographerId = req.user?.userId;
    if (!photographerId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const album = await Album.findById(albumId);
    if (!album) {
      return res.status(404).json({ message: "Album not found" });
    }

    if (req.user?.role !== 'admin' && String(album.photographer) !== String(photographerId)) {
      return res.status(403).json({ message: "You are not allowed to edit this album" });
    }

    const { name, description, price, coverImage, isPrivate } = req.body;

    if (name !== undefined) album.name = name;
    if (description !== undefined) album.description = description;
    if (price !== undefined) {
      const parsedAlbumPrice = Number(price);
      if (Number.isNaN(parsedAlbumPrice) || parsedAlbumPrice < 0) {
        return res.status(400).json({ message: "Album price must be a valid non-negative number" });
      }
      album.price = parsedAlbumPrice;
    }
    if (coverImage !== undefined) album.coverImage = coverImage;
    if (isPrivate !== undefined) {
      album.isPrivate = String(isPrivate).toLowerCase() === 'true';
    }

    if (req.file) {
      let uploadedCover = req.file.secure_url || req.file.url || req.file.path || req.file.filename || "";
      if (uploadedCover && !uploadedCover.startsWith('http') && !uploadedCover.startsWith('/')) {
        uploadedCover = `/uploads/photos/${uploadedCover}`;
      }
      if (uploadedCover) {
        album.coverImage = uploadedCover;
      }
    }

    await album.save();

    res.status(200).json({ message: "Album updated", album });
  } catch (error) {
    console.error("Error updating album:", error);
    res.status(500).json({ message: "Error updating album", error: error.message });
  }
}

export async function deleteAlbum(req, res) {
  try {
    const { albumId } = req.params;
    const photographerId = req.user?.userId;
    if (!photographerId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const album = await Album.findById(albumId);
    if (!album) {
      return res.status(404).json({ message: "Album not found" });
    }

    if (req.user?.role !== 'admin' && String(album.photographer) !== String(photographerId)) {
      return res.status(403).json({ message: "You are not allowed to delete this album" });
    }

    // Remove album reference from all media in this album
    await Media.updateMany({ album: albumId }, { $unset: { album: "" } });
    
    // Use deleteOne instead of deprecated remove() method
    await Album.deleteOne({ _id: albumId });

    res.status(200).json({ message: "Album deleted" });
  } catch (error) {
    console.error("Error deleting album:", error);
    res.status(500).json({ message: "Error deleting album", error: error.message });
  }
}
export async function likeMedia(req, res) {
  try {
    const { id } = req.params;
    const authUserId = extractAuthUserId(req);

    if (!validateObjectId(id)) {
      return normalizeError(res, 400, "Invalid media ID format");
    }

    if (!authUserId) {
      return normalizeError(res, 401, "Authentication required");
    }

    const media = await Media.findById(id);
    if (!media) {
      return normalizeError(res, 404, "Media not found");
    }

    // Increment likes count
    media.likes = (media.likes || 0) + 1;
    await media.save();

    res.status(200).json({
      message: "Media liked successfully",
      likes: media.likes
    });

  } catch (error) {
    console.error("Error liking media:", error);
    res.status(500).json({ message: "Error liking media", error: error.message });
  }
}

// ==============================
// Unlike media
// ==============================
export async function unlikeMedia(req, res) {
  try {
    const { id } = req.params;
    const authUserId = extractAuthUserId(req);

    if (!validateObjectId(id)) {
      return normalizeError(res, 400, "Invalid media ID format");
    }

    if (!authUserId) {
      return normalizeError(res, 401, "Authentication required");
    }

    const media = await Media.findById(id);
    if (!media) {
      return normalizeError(res, 404, "Media not found");
    }

    // Decrement likes count (don't go below 0)
    media.likes = Math.max((media.likes || 0) - 1, 0);
    await media.save();

    res.status(200).json({
      message: "Media unliked successfully",
      likes: media.likes
    });

  } catch (error) {
    console.error("Error unliking media:", error);
    res.status(500).json({ message: "Error unliking media", error: error.message });
  }
}

// ==============================
// Get user's liked media
// ==============================
export async function getLikedMedia(req, res) {
  try {
    const authUserId = extractAuthUserId(req);

    if (!authUserId) {
      return normalizeError(res, 401, "Authentication required");
    }

    if (!validateObjectId(authUserId)) {
      return normalizeError(res, 400, "Invalid user ID");
    }

    const favorites = await Favorite.find({ user: authUserId })
      .populate({
        path: "media",
        select: "title description price mediaType photographer fileUrl thumbnail likes",
        populate: {
          path: "photographer",
          select: "username profilePicture"
        }
      })
      .sort({ addedAt: -1 });

    const likedMedia = favorites
      .map((favorite) => {
        if (!favorite.media) return null;
        const mediaItem = favorite.media.toObject ? favorite.media.toObject() : favorite.media;
        return {
          ...mediaItem,
          isFavorited: true,
        };
      })
      .filter(Boolean);

    res.status(200).json(likedMedia);

  } catch (error) {
    console.error("Error fetching liked media:", error);
    res.status(500).json({ message: "Error fetching liked media", error: error.message });
  }
}

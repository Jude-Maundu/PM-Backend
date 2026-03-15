import Media from "../models/media.js";
import Album from "../models/album.js";
import EventAccess from "../models/EventAccess.js";
import Payment from "../models/Payment.js";
import User from "../models/users.js";

// ==============================
// Get all media
// ==============================
export async function getAllMedia(req, res) {
  try {
    const media = await Media.find()
      .populate("photographer", "username email");

    res.status(200).json(media);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ==============================
// Get one media
// ==============================
export async function getOneMedia(req, res) {
  try {
    const media = await Media.findById(req.params.id)
      .populate("photographer", "username email");

    if (!media) return res.status(404).json({ message: "Media not found" });

    res.status(200).json(media);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ==============================
// Create event access token (photographer shares to a buyer)
// ==============================
export async function createEventAccess(req, res) {
  try {
    const { albumId } = req.params;
    const { buyerId, buyerEmail, email, buyerPhone, expiresInMinutes = 60 } = req.body;

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

    if (album.photographer.toString() !== photographerId) {
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

    res.status(200).json({
      album: albumId,
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
// Get media with download protection (requires buyer has completed purchase)
// ==============================
export async function getProtectedMedia(req, res) {
  try {
    const { id } = req.params;

    // Determine userId from multiple sources:
    // - JWT auth middleware (req.user.userId)
    // - query string (for GET requests)
    // - request body (fallback)
    const userId =
      req.user?.userId ||
      req.query?.userId ||
      req.query?.user ||
      req.body?.userId ||
      req.body?.user;

    if (!userId) {
      return res.status(401).json({ message: "User id required for protected media" });
    }

    const media = await Media.findById(id)
      .populate("photographer", "username email");

    if (!media) return res.status(404).json({ message: "Media not found" });

    // Admins can access any media without purchase
    if (req.user?.role !== "admin") {
      const payment = await Payment.findOne({
        media: id,
        buyer: userId,
        status: "completed"
      });

      if (!payment) {
        return res.status(403).json({
          message: "Download not permitted. You need to purchase this media first."
        });
      }
    }

    // Generate secure download URL (short-lived)
    const downloadToken = Buffer.from(`${id}:${userId}:${Date.now()}`).toString("base64");
    const signedUrl = `/api/media/${id}/download?token=${encodeURIComponent(downloadToken)}&user=${userId}`;

    res.status(200).json({
      media,
      downloadUrl: signedUrl,
      canDownload: true,
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ==============================
// Allow downloading after token check (secure link)
// ==============================
export async function downloadMedia(req, res) {
  try {
    const { id } = req.params;
    const { token, user: userId } = req.query;

    if (!token || !userId) {
      return res.status(400).json({ message: "Download token and user required" });
    }

    // Token is base64 encoded with id:userId:timestamp
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const [mediaId, tokenUserId, timestamp] = decoded.split(":");

    if (mediaId !== id || tokenUserId !== userId) {
      return res.status(403).json({ message: "Invalid download token" });
    }

    const isExpired = (Date.now() - Number(timestamp)) > (10 * 60 * 1000); // 10 minutes
    if (isExpired) {
      return res.status(403).json({ message: "Download token has expired" });
    }

    const media = await Media.findById(id);
    if (!media) return res.status(404).json({ message: "Media not found" });

    // Ensure buyer has paid
    const payment = await Payment.findOne({
      media: id,
      buyer: userId,
      status: "completed"
    });

    if (!payment) {
      return res.status(403).json({ message: "You need to purchase this media first" });
    }

    // Increment download count for the media (optional)
    await Media.findByIdAndUpdate(id, { $inc: { downloads: 1 } });

    // For now redirect to file URL (Cloudinary) or send file URL
    return res.redirect(media.fileUrl);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ==============================
// Create media (photo/video) - Cloudinary
// ==============================
export async function createMedia(req, res) {
  try {
    const { title, description, price, photographer, mediaType, album } = req.body;

    if (!photographer) {
      return res.status(400).json({ message: "Photographer ID is required" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "File (image/video) is required" });
    }

    // Use Cloudinary URL directly
    const fileUrl = req.file.path;

    const media = await Media.create({
      title,
      description,
      price: price || 0,
      fileUrl,         // <-- save Cloudinary URL here
      mediaType,
      album: album || null,
      photographer,
    });

    res.status(201).json(media);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ==============================
// Delete media
// ==============================
export async function deleteMedia(req, res) {
  try {
    const media = await Media.findByIdAndDelete(req.params.id);

    if (!media) return res.status(404).json({ message: "Media not found" });

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
    const media = await Media.findByIdAndUpdate(req.params.id, req.body, { new: true });

    if (!media) return res.status(404).json({ message: "Media not found" });

    res.status(200).json(media);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ==============================
// Update media price (photographer only)
// ==============================
export async function updateMediaPrice(req, res) {
  try {
    const { id } = req.params;
    const { price, photographerId } = req.body;

    const media = await Media.findById(id);
    if (!media) return res.status(404).json({ message: "Media not found" });

    // Verify photographer owns this media
    if (media.photographer.toString() !== photographerId) {
      return res.status(403).json({ message: "Unauthorized: You don't own this media" });
    }

    if (price < 0) {
      return res.status(400).json({ message: "Price cannot be negative" });
    }

    media.price = price;
    await media.save();

    res.status(200).json({ message: "Price updated", media });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

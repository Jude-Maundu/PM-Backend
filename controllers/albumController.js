import Media from "../models/media.js";
import Album from "../models/album.js";
import User from "../models/users.js";
import ShareToken from "../models/ShareToken.js";

function buildWatermarkedUrl(originalUrl, watermarkText) {
  if (!originalUrl || !originalUrl.includes("cloudinary.com/")) return "";
  if (!watermarkText || !watermarkText.trim()) return "";

  const safeText = encodeURIComponent(
    watermarkText.trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, " ")
  );

  return originalUrl.replace(
    "/upload/",
    `/upload/l_text:Arial_34_bold:${safeText},co_white,o_38,a_25,c_lpad,w_360,h_220,fl_layer_apply,fl_tiled/`
  );
}

function normalizeFileUrl(fileUrl) {
  if (!fileUrl) return fileUrl;
  const trimmed = fileUrl.toString().trim();
  if (/^(https?:)?\/\//i.test(trimmed)) return trimmed;
  const idx = trimmed.indexOf("/uploads/");
  if (idx !== -1) return trimmed.slice(idx);
  if (!trimmed.startsWith("/")) return `/uploads/photos/${trimmed}`;
  return trimmed;
}

async function hydrateWatermarkedMedia(items = []) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const photographerIds = [...new Set(
    items
      .map((item) => {
        const plain = typeof item?.toObject === "function" ? item.toObject() : item;
        return plain?.photographer?._id || plain?.photographer || null;
      })
      .filter(Boolean)
      .map((id) => String(id))
  )];

  const photographers = photographerIds.length
    ? await User.find({ _id: { $in: photographerIds } }).select("watermark username").lean()
    : [];

  const watermarkMap = new Map(
    photographers.map((photographer) => [
      String(photographer._id),
      photographer?.watermark?.trim() || photographer?.username || "",
    ])
  );

  return items.map((item) => {
    const plain = typeof item?.toObject === "function" ? item.toObject() : item;
    const photographerId = plain?.photographer?._id || plain?.photographer || null;
    const watermarkText =
      watermarkMap.get(String(photographerId || "")) ||
      plain?.photographer?.username ||
      "";

    const normalizedFileUrl = normalizeFileUrl(plain?.fileUrl);
    const normalizedStoredWatermark = normalizeFileUrl(plain?.watermarkedUrl);
    const generatedWatermark = buildWatermarkedUrl(normalizedFileUrl || plain?.fileUrl, watermarkText);

    return {
      ...plain,
      fileUrl: normalizedFileUrl,
      watermarkedUrl: generatedWatermark || normalizedStoredWatermark || normalizedFileUrl || "",
    };
  });
}

function getRequestUserId(req) {
  return (
    req.user?.userId ||
    req.user?.id ||
    req.user?._id ||
    req.body?.userId ||
    req.query?.userId ||
    req.query?.user ||
    req.body?.user
  )?.toString?.().trim();
}

// ==============================
// MEDIA CRUD OPERATIONS
// ==============================

export async function getAllMedia(req, res) {
  try {
    const media = await Media.find()
      .populate("photographer", "username email")
      .sort({ createdAt: -1 });
    res.status(200).json(media);
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getMyMedia(req, res) {
  try {
    const userId = getRequestUserId(req);
    const media = await Media.find({ photographer: userId })
      .populate("photographer", "username email")
      .sort({ createdAt: -1 });
    res.status(200).json(media);
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getOneMedia(req, res) {
  try {
    const media = await Media.findById(req.params.id)
      .populate("photographer", "username email");
    if (!media) return res.status(404).json({ message: "Media not found" });
    res.status(200).json(media);
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getProtectedMedia(req, res) {
  try {
    const { id } = req.params;
    const userId = getRequestUserId(req);

    const media = await Media.findById(id);
    if (!media) return res.status(404).json({ message: "Media not found" });

    // Generate secure download URL
    const downloadToken = Buffer.from(id + userId + Date.now()).toString("base64");
    const signedUrl = `/api/media/${id}/download?token=${downloadToken}&user=${userId}`;

    res.status(200).json({
      media,
      downloadUrl: signedUrl,
      canDownload: true,
    });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function downloadMedia(req, res) {
  try {
    const { id } = req.params;
    const media = await Media.findById(id);
    if (!media) return res.status(404).json({ message: "Media not found" });

    const filename = media.fileUrl.split('/').pop();
    const filePath = `uploads/photos/${filename}`;
    
    // Increment download count
    media.downloads += 1;
    await media.save();
    
    res.download(filePath, filename);
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getMediaPrice(req, res) {
  try {
    const media = await Media.findById(req.params.id);
    if (!media) return res.status(404).json({ message: "Media not found" });
    res.status(200).json({ price: media.price });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function createMedia(req, res) {
  try {
    const { title, description, price, photographer, mediaType, album } = req.body;

    if (!photographer) {
      return res.status(400).json({ message: "Photographer ID is required" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "File is required" });
    }

    const fileUrl = req.file.path;
    const parsedPrice = Number(price ?? 0);
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ message: "Media price must be a valid non-negative number" });
    }

    const media = await Media.create({
      title,
      description,
      price: parsedPrice,
      fileUrl,
      mediaType,
      album: album || null,
      photographer,
    });

    // If album is specified, add media to album
    if (album) {
      await Album.findByIdAndUpdate(album, {
        $push: { media: media._id },
        $inc: { mediaCount: 1 }
      });
    }

    res.status(201).json(media);
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function updateMedia(req, res) {
  try {
    const media = await Media.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!media) return res.status(404).json({ message: "Media not found" });
    res.status(200).json(media);
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function updateMediaPrice(req, res) {
  try {
    const { id } = req.params;
    const { price, photographerId } = req.body;

    const media = await Media.findById(id);
    if (!media) return res.status(404).json({ message: "Media not found" });

    if (media.photographer.toString() !== photographerId) {
      return res.status(403).json({ message: "Unauthorized: You don't own this media" });
    }

    const priceNumber = Number(price);
    if (Number.isNaN(priceNumber) || priceNumber < 0) {
      return res.status(400).json({ message: "Price must be a valid non-negative number" });
    }

    media.price = priceNumber;
    await media.save();

    res.status(200).json({ message: "Price updated", media });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function deleteMedia(req, res) {
  try {
    const media = await Media.findByIdAndDelete(req.params.id);
    if (!media) return res.status(404).json({ message: "Media not found" });

    // Remove media from any albums
    await Album.updateMany(
      { media: req.params.id },
      { $pull: { media: req.params.id }, $inc: { mediaCount: -1 } }
    );

    res.status(200).json({ message: "Media deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
}

// ==============================
// LIKE FUNCTIONALITY
// ==============================

export async function likeMedia(req, res) {
  try {
    const { id } = req.params;
    const userId = getRequestUserId(req);

    const media = await Media.findById(id);
    if (!media) return res.status(404).json({ message: "Media not found" });

    if (!media.likedBy) media.likedBy = [];
    if (media.likedBy.includes(userId)) {
      return res.status(400).json({ message: "Already liked" });
    }

    media.likedBy.push(userId);
    media.likes = (media.likes || 0) + 1;
    await media.save();

    res.status(200).json({ message: "Liked", likes: media.likes });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function unlikeMedia(req, res) {
  try {
    const { id } = req.params;
    const userId = getRequestUserId(req);

    const media = await Media.findById(id);
    if (!media) return res.status(404).json({ message: "Media not found" });

    media.likedBy = media.likedBy?.filter(id => id.toString() !== userId) || [];
    media.likes = Math.max((media.likes || 0) - 1, 0);
    await media.save();

    res.status(200).json({ message: "Unliked", likes: media.likes });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getLikedMedia(req, res) {
  try {
    const userId = getRequestUserId(req);
    const media = await Media.find({ likedBy: userId }).populate("photographer", "username email");
    res.status(200).json(media);
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
}

// ==============================
// ALBUM CRUD OPERATIONS
// ==============================

export async function createAlbum(req, res) {
  try {
    const { name, description, price, coverImage, coverImagePosition } = req.body;
    const userId = getRequestUserId(req);

    if (!name || name.trim() === '') {
      return res.status(400).json({ message: "Album name is required" });
    }

    const albumPrice = Number(price);
    if (Number.isNaN(albumPrice) || albumPrice <= 0) {
      return res.status(400).json({ message: "Album price must be greater than 0" });
    }

    let coverImageUrl = coverImage || '';
    if (req.file) {
      coverImageUrl = req.file.path || req.file.url || req.file.secure_url || coverImageUrl;
    }

    const album = await Album.create({
      name: name.trim(),
      description: description?.trim() || '',
      coverImage: coverImageUrl,
      coverImagePosition: {
        x: Number.isFinite(Number(coverImagePosition?.x)) ? Math.min(100, Math.max(0, Number(coverImagePosition.x))) : 50,
        y: Number.isFinite(Number(coverImagePosition?.y)) ? Math.min(100, Math.max(0, Number(coverImagePosition.y))) : 50,
      },
      price: albumPrice,
      photographer: userId,
      media: [],
      mediaCount: 0,
      views: 0,
      purchasedBy: []
    });

    res.status(201).json({
      success: true,
      message: "Album created successfully",
      album
    });
  } catch (error) {
    console.error("Error creating album:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getAlbums(req, res) {
  try {
    const userId = getRequestUserId(req);
    const query = userId ? { photographer: userId } : {};

    const albums = await Album.find(query)
      .populate('photographer', 'username email')
      .sort({ createdAt: -1 });

    // Count from Media collection as the authoritative source (album.media array can be out of sync)
    const albumIds = albums.map(a => a._id);
    const mediaCounts = await Media.aggregate([
      { $match: { album: { $in: albumIds } } },
      { $group: { _id: '$album', count: { $sum: 1 } } }
    ]);
    const countMap = {};
    mediaCounts.forEach(c => { countMap[c._id.toString()] = c.count; });

    res.status(200).json({
      success: true,
      albums: albums.map(a => ({
        ...a.toObject(),
        mediaCount: countMap[a._id.toString()] ?? a.media?.length ?? a.mediaCount ?? 0
      }))
    });
  } catch (error) {
    console.error("Error fetching albums:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getAlbum(req, res) {
  try {
    const { albumId } = req.params;

    const album = await Album.findById(albumId)
      .populate('photographer', 'username email')
      .populate('media', 'title price fileUrl watermarkedUrl imageUrl mediaType likes views downloads');

    if (!album) {
      return res.status(404).json({ message: "Album not found" });
    }

    // Also find media that references this album directly (handles sync issues)
    const linkedMedia = await Media.find({
      album: albumId,
      _id: { $nin: album.media.map(m => m._id) }
    }).select('title price fileUrl watermarkedUrl imageUrl mediaType likes views downloads');

    const allMedia = [...album.media, ...linkedMedia];

    // Increment view count
    album.views += 1;
    await album.save();

    res.status(200).json({
      success: true,
      album: {
        ...album.toObject(),
        media: allMedia,
        mediaCount: allMedia.length
      }
    });
  } catch (error) {
    console.error("Error fetching album:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function updateAlbum(req, res) {
  try {
    const { albumId } = req.params;
    const { name, description, coverImage, price, coverImagePosition } = req.body;
    const userId = getRequestUserId(req);

    const album = await Album.findOne({ _id: albumId, photographer: userId });
    if (!album) {
      return res.status(404).json({ message: "Album not found or not owned by you" });
    }

    if (name) album.name = name.trim();
    if (description !== undefined) album.description = description.trim();
    if (req.file) {
      album.coverImage = req.file.path || req.file.url || req.file.secure_url || coverImage || album.coverImage;
    } else if (coverImage !== undefined) {
      album.coverImage = coverImage;
    }
    if (coverImagePosition && typeof coverImagePosition === "object") {
      const x = Number(coverImagePosition.x);
      const y = Number(coverImagePosition.y);
      album.coverImagePosition = {
        x: Number.isFinite(x) ? Math.min(100, Math.max(0, x)) : 50,
        y: Number.isFinite(y) ? Math.min(100, Math.max(0, y)) : 50,
      };
    }
    if (price !== undefined) {
      const albumPrice = Number(price);
      if (Number.isNaN(albumPrice) || albumPrice <= 0) {
        return res.status(400).json({ message: "Album price must be greater than 0" });
      }
      album.price = albumPrice;
    }

    await album.save();

    res.status(200).json({
      success: true,
      message: "Album updated successfully",
      album
    });
  } catch (error) {
    console.error("Error updating album:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function deleteAlbum(req, res) {
  try {
    const { albumId } = req.params;
    const userId = getRequestUserId(req);

    const album = await Album.findOneAndDelete({ _id: albumId, photographer: userId });
    if (!album) {
      return res.status(404).json({ message: "Album not found or not owned by you" });
    }

    res.status(200).json({
      success: true,
      message: "Album deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting album:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

// ==============================
// ALBUM MEDIA MANAGEMENT
// ==============================

export async function addMediaToAlbum(req, res) {
  try {
    const { albumId } = req.params;
    const { mediaId } = req.body;
    const userId = getRequestUserId(req);

    // Find album and verify ownership
    const album = await Album.findOne({ _id: albumId, photographer: userId });
    if (!album) {
      return res.status(404).json({ 
        success: false,
        message: "Album not found or not owned by you" 
      });
    }

    // Find media and verify ownership
    const media = await Media.findOne({ _id: mediaId, photographer: userId });
    if (!media) {
      return res.status(404).json({ 
        success: false,
        message: "Media not found or not owned by you" 
      });
    }

    // Check if media already in album
    if (album.media.includes(mediaId)) {
      return res.status(400).json({ 
        success: false,
        message: "Media already in this album" 
      });
    }

    // Add media to album and back-link the media document
    album.media.push(mediaId);
    album.mediaCount = (album.mediaCount || 0) + 1;
    await Promise.all([
      album.save(),
      Media.findByIdAndUpdate(mediaId, { album: albumId })
    ]);

    res.status(200).json({
      success: true,
      message: "Media added to album",
      album: {
        _id: album._id,
        name: album.name,
        mediaCount: album.mediaCount
      }
    });
  } catch (error) {
    console.error("Error adding media to album:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function removeMediaFromAlbum(req, res) {
  try {
    const { albumId, mediaId } = req.params;
    const userId = getRequestUserId(req);

    // Find album and verify ownership
    const album = await Album.findOne({ _id: albumId, photographer: userId });
    if (!album) {
      return res.status(404).json({ 
        success: false,
        message: "Album not found or not owned by you" 
      });
    }

    // Remove media from album and clear the back-link
    album.media = album.media.filter(id => id.toString() !== mediaId);
    album.mediaCount = Math.max((album.mediaCount || 0) - 1, 0);
    await Promise.all([
      album.save(),
      Media.findByIdAndUpdate(mediaId, { album: null })
    ]);

    res.status(200).json({
      success: true,
      message: "Media removed from album",
      album: {
        _id: album._id,
        name: album.name,
        mediaCount: album.mediaCount
      }
    });
  } catch (error) {
    console.error("Error removing media from album:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getAlbumMedia(req, res) {
  try {
    const { albumId } = req.params;
    const userId = getRequestUserId(req);

    // Find album and verify ownership
    const album = await Album.findOne({ _id: albumId, photographer: userId })
      .populate('media', 'title price fileUrl mediaType likes views downloads createdAt');

    if (!album) {
      return res.status(404).json({ 
        success: false,
        message: "Album not found or not owned by you" 
      });
    }

    res.status(200).json({
      success: true,
      media: album.media || []
    });
  } catch (error) {
    console.error("Error fetching album media:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

// ==============================
// BULK UPLOAD TO ALBUM
// ==============================

export async function bulkUploadAlbumMedia(req, res) {
  try {
    const { albumId, photographer } = req.body;
    const userId = getRequestUserId(req);

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    // Find album — search by id only, not photographer, so the link is always made
    let album = null;
    if (albumId) {
      album = await Album.findById(albumId);
      if (!album) {
        return res.status(404).json({ message: "Album not found" });
      }
    }

    const uploadedMedia = [];
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const filePrice = Number(req.body[`price_${i}`] ?? req.body.price ?? 0);

      const media = await Media.create({
        title: req.body[`title_${i}`] || file.originalname,
        description: req.body.description || '',
        price: isNaN(filePrice) || filePrice < 0 ? 0 : filePrice,
        fileUrl: file.path,
        mediaType: file.mimetype.startsWith('video') ? 'video' : 'photo',
        photographer: photographer || userId,
        album: albumId || null
      });
      uploadedMedia.push(media);

      if (album) {
        album.media.push(media._id);
      }
    }

    if (album) {
      album.mediaCount = album.media.length;
      await album.save();
    }

    res.status(201).json({
      success: true,
      message: `Successfully uploaded ${uploadedMedia.length} files`,
      media: uploadedMedia
    });
  } catch (error) {
    console.error("Bulk upload error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

// ==============================
// EVENT ACCESS (Share Links)
// ==============================

export async function createEventAccess(req, res) {
  try {
    const { albumId } = req.params;
    const { expiresInHours = 24, maxAccess = 10, description, customMessage } = req.body;
    const userId = getRequestUserId(req);

    const album = await Album.findOne({ _id: albumId, photographer: userId });
    if (!album) {
      return res.status(404).json({ message: "Album not found or not owned by you" });
    }

    const token = Buffer.from(`${albumId}-${Date.now()}-${Math.random()}`).toString('base64').replace(/[/+=]/g, '');
    const expiresAt = new Date(Date.now() + Number(expiresInHours) * 60 * 60 * 1000);
    const shareUrl = `${process.env.FRONTEND_URL || process.env.BASE_URL || 'http://localhost:3000'}/album/${albumId}/access/${token}`;

    const shareToken = await ShareToken.create({
      media: null,
      album: album._id,
      createdBy: userId,
      token,
      shareUrl,
      expiresAt,
      maxDownloads: Number(maxAccess) || 10,
      accessCount: 0,
      isActive: true,
      description,
      customMessage
    });

    res.status(201).json({
      success: true,
      shareLink: shareUrl,
      token,
      expiresAt,
      maxAccess: Number(maxAccess) || 10,
      description,
      customMessage,
      shareTokenId: shareToken._id
    });
  } catch (error) {
    console.error("Error creating event access:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getEventMediaByToken(req, res) {
  try {
    const { albumId, token } = req.params;

    const shareToken = await ShareToken.findOne({ token, album: albumId, isActive: true });
    if (!shareToken) {
      return res.status(404).json({ success: false, message: "Access token not found or expired" });
    }

    if (shareToken.expiresAt && shareToken.expiresAt < new Date()) {
      shareToken.isActive = false;
      await shareToken.save();
      return res.status(410).json({ success: false, message: "Access token has expired" });
    }

    if (shareToken.maxDownloads && shareToken.accessCount >= shareToken.maxDownloads) {
      shareToken.isActive = false;
      await shareToken.save();
      return res.status(403).json({ success: false, message: "Access limit reached for this album link" });
    }

    const album = await Album.findById(albumId)
      .populate('media', 'title price fileUrl mediaType likes views downloads photographer description createdAt')
      .populate('photographer', 'username email profilePicture');
    if (!album) {
      return res.status(404).json({ message: "Album not found" });
    }

    shareToken.accessCount += 1;
    shareToken.accessLog.push({
      timestamp: new Date(),
      ip: req.ip,
      userAgent: req.headers['user-agent'] || '',
      action: 'view'
    });
    await shareToken.save();

    res.status(200).json({
      success: true,
      album: {
        _id: album._id,
        name: album.name,
        description: album.description,
        coverImage: album.coverImage,
        price: album.price,
        photographer: album.photographer,
        media: album.media,
        mediaCount: album.mediaCount,
        views: album.views
      }
    });
  } catch (error) {
    console.error("Error fetching event media:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}
// ==============================
// PUBLIC ALBUM BROWSING
// ==============================

export async function getPublicAlbums(req, res) {
  try {
    const { albumType, eventType, search, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const query = { isPrivate: false };
    if (albumType) query.albumType = albumType;
    if (eventType) query.eventType = eventType;
    if (search) query.name = { $regex: search, $options: 'i' };

    const [albums, total] = await Promise.all([
      Album.find(query)
        .populate('photographer', 'username profilePicture')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .select('name description coverImage price albumType eventType mediaCount views purchasedBy photographer createdAt tags location'),
      Album.countDocuments(query),
    ]);

    res.status(200).json({ success: true, albums, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (error) {
    console.error("Error fetching public albums:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getPublicAlbumById(req, res) {
  try {
    const { albumId } = req.params;

    const album = await Album.findOne({ _id: albumId, isPrivate: false })
      .populate('photographer', 'username profilePicture bio location')
      .populate('media', 'title price fileUrl watermarkedUrl imageUrl mediaType downloads views likes isApproved description');

    if (!album) return res.status(404).json({ message: "Album not found or is private" });

    // Merge orphaned media (same dual-reference fix as getAlbum)
    const linkedMedia = await Media.find({
      album: albumId,
      _id: { $nin: album.media.map(m => m._id) }
    }).select('title price fileUrl watermarkedUrl imageUrl mediaType downloads views likes isApproved description');

    const allMedia = [...album.media, ...linkedMedia];
    const hydratedMedia = await hydrateWatermarkedMedia(allMedia);
    const photographerWatermark =
      album.photographer?.watermark ||
      (await User.findById(album.photographer?._id || album.photographer).select("watermark username").lean())?.watermark ||
      album.photographer?.username ||
      "";
    const watermarkedCover =
      buildWatermarkedUrl(normalizeFileUrl(album.coverImage), photographerWatermark) ||
      normalizeFileUrl(album.coverImage);

    Album.findByIdAndUpdate(albumId, { $inc: { views: 1 } }).catch(() => {});

    res.status(200).json({
      success: true,
      album: {
        ...album.toObject(),
        coverImage: watermarkedCover,
        media: hydratedMedia,
        mediaCount: hydratedMedia.length,
      }
    });
  } catch (error) {
    console.error("Error fetching public album:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

// Update payout phone — separate dedicated endpoint
export async function updatePayoutPhone(req, res) {
  try {
    const { id } = req.params;
    const { payoutPhoneNumber } = req.body;
    const requesterId = getRequestUserId(req);

    if (requesterId !== id && req.user?.role !== 'admin') {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const phoneRegex = /^254\d{9}$/;
    if (!phoneRegex.test(payoutPhoneNumber)) {
      return res.status(400).json({ message: "Invalid phone format. Use 254XXXXXXXXX" });
    }

    const user = await User.findByIdAndUpdate(id, { payoutPhoneNumber }, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: "User not found" });

    res.status(200).json({ success: true, message: "Payout phone updated", payoutPhoneNumber: user.payoutPhoneNumber });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
}

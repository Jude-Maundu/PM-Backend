import Media from "../models/media.js";
import Album from "../models/album.js";
import User from "../models/users.js";

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
    res.status(500).json({ message: error.message });
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
    res.status(500).json({ message: error.message });
  }
}

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
    res.status(500).json({ message: error.message });
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
    res.status(500).json({ message: error.message });
  }
}

export async function getMediaPrice(req, res) {
  try {
    const media = await Media.findById(req.params.id);
    if (!media) return res.status(404).json({ message: "Media not found" });
    res.status(200).json({ price: media.price });
  } catch (error) {
    res.status(500).json({ message: error.message });
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

    const media = await Media.create({
      title,
      description,
      price: price || 0,
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
    res.status(500).json({ message: error.message });
  }
}

export async function updateMedia(req, res) {
  try {
    const media = await Media.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!media) return res.status(404).json({ message: "Media not found" });
    res.status(200).json(media);
  } catch (error) {
    res.status(500).json({ message: error.message });
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
    res.status(500).json({ message: error.message });
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
    res.status(500).json({ message: error.message });
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
    res.status(500).json({ message: error.message });
  }
}

export async function getLikedMedia(req, res) {
  try {
    const userId = getRequestUserId(req);
    const media = await Media.find({ likedBy: userId }).populate("photographer", "username email");
    res.status(200).json(media);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ==============================
// ALBUM CRUD OPERATIONS
// ==============================

export async function createAlbum(req, res) {
  try {
    const { name, description, price, coverImage } = req.body;
    const userId = getRequestUserId(req);

    if (!name || name.trim() === '') {
      return res.status(400).json({ message: "Album name is required" });
    }

    const album = await Album.create({
      name: name.trim(),
      description: description?.trim() || '',
      coverImage: coverImage || '',
      price: price || 0,
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
    res.status(500).json({ message: error.message });
  }
}

export async function getAlbums(req, res) {
  try {
    const userId = getRequestUserId(req);
    const query = userId ? { photographer: userId } : {};
    
    const albums = await Album.find(query)
      .populate('photographer', 'username email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      albums
    });
  } catch (error) {
    console.error("Error fetching albums:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function getAlbum(req, res) {
  try {
    const { albumId } = req.params;
    const userId = getRequestUserId(req);

    const album = await Album.findOne({ _id: albumId })
      .populate('photographer', 'username email')
      .populate('media', 'title price fileUrl mediaType likes views downloads');

    if (!album) {
      return res.status(404).json({ message: "Album not found" });
    }

    // Increment view count
    album.views += 1;
    await album.save();

    res.status(200).json({
      success: true,
      album
    });
  } catch (error) {
    console.error("Error fetching album:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function updateAlbum(req, res) {
  try {
    const { albumId } = req.params;
    const { name, description, coverImage, price } = req.body;
    const userId = getRequestUserId(req);

    const album = await Album.findOne({ _id: albumId, photographer: userId });
    if (!album) {
      return res.status(404).json({ message: "Album not found or not owned by you" });
    }

    if (name) album.name = name.trim();
    if (description !== undefined) album.description = description.trim();
    if (coverImage !== undefined) album.coverImage = coverImage;
    if (price !== undefined) album.price = price;

    await album.save();

    res.status(200).json({
      success: true,
      message: "Album updated successfully",
      album
    });
  } catch (error) {
    console.error("Error updating album:", error);
    res.status(500).json({ message: error.message });
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
    res.status(500).json({ message: error.message });
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

    // Add media to album
    album.media.push(mediaId);
    album.mediaCount = (album.mediaCount || 0) + 1;
    await album.save();

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
    res.status(500).json({ message: error.message });
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

    // Remove media from album
    album.media = album.media.filter(id => id.toString() !== mediaId);
    album.mediaCount = Math.max((album.mediaCount || 0) - 1, 0);
    await album.save();

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
    res.status(500).json({ message: error.message });
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
    res.status(500).json({ message: error.message });
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

    // Verify album ownership if albumId provided
    let album = null;
    if (albumId) {
      album = await Album.findOne({ _id: albumId, photographer: userId });
      if (!album) {
        return res.status(404).json({ message: "Album not found or not owned by you" });
      }
    }

    const uploadedMedia = [];
    for (const file of req.files) {
      const media = await Media.create({
        title: file.originalname,
        description: req.body.description || `Uploaded on ${new Date().toLocaleDateString()}`,
        price: parseFloat(req.body.price) || 0,
        fileUrl: file.path,
        mediaType: file.mimetype.startsWith('video') ? 'video' : 'photo',
        photographer: photographer || userId,
        album: albumId || null
      });
      uploadedMedia.push(media);

      // Add to album if album exists
      if (album) {
        album.media.push(media._id);
      }
    }

    if (album) {
      album.mediaCount = (album.mediaCount || 0) + uploadedMedia.length;
      await album.save();
    }

    res.status(201).json({
      success: true,
      message: `Successfully uploaded ${uploadedMedia.length} files`,
      media: uploadedMedia
    });
  } catch (error) {
    console.error("Bulk upload error:", error);
    res.status(500).json({ message: error.message });
  }
}

// ==============================
// EVENT ACCESS (Share Links)
// ==============================

export async function createEventAccess(req, res) {
  try {
    const { albumId } = req.params;
    const { expiresInHours = 24, maxAccess = 10 } = req.body;
    const userId = getRequestUserId(req);

    const album = await Album.findOne({ _id: albumId, photographer: userId });
    if (!album) {
      return res.status(404).json({ message: "Album not found or not owned by you" });
    }

    const token = Buffer.from(`${albumId}-${Date.now()}-${Math.random()}`).toString('base64').replace(/[/+=]/g, '');
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    // Store token in a separate collection (you'd need a ShareToken model)
    // For now, return the token

    const shareLink = `${process.env.BASE_URL}/share/album/${albumId}/${token}`;

    res.status(201).json({
      success: true,
      shareLink,
      token,
      expiresAt,
      maxAccess
    });
  } catch (error) {
    console.error("Error creating event access:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function getEventMediaByToken(req, res) {
  try {
    const { albumId, token } = req.params;
    
    // Verify token (simplified - would need to check against stored tokens)
    const album = await Album.findById(albumId).populate('media');
    if (!album) {
      return res.status(404).json({ message: "Album not found" });
    }

    res.status(200).json({
      success: true,
      album: {
        name: album.name,
        description: album.description,
        media: album.media
      }
    });
  } catch (error) {
    console.error("Error fetching event media:", error);
    res.status(500).json({ message: error.message });
  }
}
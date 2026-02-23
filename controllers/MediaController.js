import Media from "../models/media.js";

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
// Get media with download protection (requires auth)
// ==============================
export async function getProtectedMedia(req, res) {
  try {
    const { id } = req.params;
    const { userId } = req.body; // From auth middleware

    const media = await Media.findById(id)
      .populate("photographer", "username email");

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

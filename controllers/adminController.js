import Media from "../models/media.js";
import Album from "../models/album.js";
import User from "../models/users.js";
import Payment from "../models/Payment.js";

/**
 * Admin: Get all media with filters
 * Can filter by photographer, uploaded date, price, status, etc.
 */
export async function getAllMediaAdmin(req, res) {
  try {
    const {
      page = 1,
      limit = 20,
      photographer = null,
      search = null,
      minPrice = null,
      maxPrice = null,
      mediaType = null,
      album = null,
      sortBy = "createdAt",
      sortOrder = "desc"
    } = req.query;

    const skipAmount = (page - 1) * limit;
    let filter = {};

    // Build filter
    if (photographer) filter.photographer = photographer;
    if (mediaType) filter.mediaType = mediaType;
    if (album) filter.album = album;
    
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } }
      ];
    }

    if (minPrice !== null || maxPrice !== null) {
      filter.price = {};
      if (minPrice !== null) filter.price.$gte = Number(minPrice);
      if (maxPrice !== null) filter.price.$lte = Number(maxPrice);
    }

    // Build sort object
    const sortObj = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    // Get total count for pagination
    const total = await Media.countDocuments(filter);

    // Get paginated results
    const media = await Media.find(filter)
      .populate("photographer", "username email profilePicture role")
      .populate("album", "name")
      .sort(sortObj)
      .skip(skipAmount)
      .limit(parseInt(limit))
      .lean();

    res.status(200).json({
      success: true,
      data: media,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("[getAllMediaAdmin] Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Admin: Get all albums with filters
 */
export async function getAllAlbumsAdmin(req, res) {
  try {
    const {
      page = 1,
      limit = 20,
      photographer = null,
      search = null,
      minPrice = null,
      maxPrice = null,
      sortBy = "createdAt",
      sortOrder = "desc"
    } = req.query;

    const skipAmount = (page - 1) * limit;
    let filter = {};

    // Build filter
    if (photographer) filter.photographer = photographer;
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } }
      ];
    }

    if (minPrice !== null || maxPrice !== null) {
      filter.price = {};
      if (minPrice !== null) filter.price.$gte = Number(minPrice);
      if (maxPrice !== null) filter.price.$lte = Number(maxPrice);
    }

    // Build sort object
    const sortObj = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    // Get total count
    const total = await Album.countDocuments(filter);

    // Get paginated results
    const albums = await Album.find(filter)
      .populate("photographer", "username email profilePicture role")
      .populate("media", "title fileUrl mediaType price")
      .sort(sortObj)
      .skip(skipAmount)
      .limit(parseInt(limit))
      .lean();

    res.status(200).json({
      success: true,
      data: albums,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("[getAllAlbumsAdmin] Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Admin: Get detailed media info
 */
export async function getMediaDetailsAdmin(req, res) {
  try {
    const { mediaId } = req.params;

    const media = await Media.findById(mediaId)
      .populate("photographer", "username email profilePicture totalEarnings")
      .populate("album", "name price")
      .populate("purchasedBy", "username email");

    if (!media) {
      return res.status(404).json({ success: false, message: "Media not found" });
    }

    // Get sales data for this media
    const sales = await Payment.find({
      media: mediaId,
      status: "completed"
    }).countDocuments();

    // Get total revenue from this media
    const revenue = await Payment.aggregate([
      {
        $match: {
          media: media._id,
          status: "completed"
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" },
          totalSales: { $sum: 1 },
          adminEarnings: { $sum: "$adminShare" },
          photographerEarnings: { $sum: "$photographerShare" }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      media,
      stats: revenue[0] || {
        totalRevenue: 0,
        totalSales: 0,
        adminEarnings: 0,
        photographerEarnings: 0
      }
    });
  } catch (error) {
    console.error("[getMediaDetailsAdmin] Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Admin: Get detailed album info
 */
export async function getAlbumDetailsAdmin(req, res) {
  try {
    const { albumId } = req.params;

    const album = await Album.findById(albumId)
      .populate("photographer", "username email profilePicture totalEarnings")
      .populate("media", "title fileUrl mediaType price downloads")
      .populate("purchasedBy", "username email");

    if (!album) {
      return res.status(404).json({ success: false, message: "Album not found" });
    }

    // Get sales data for this album
    const sales = await Payment.find({
      album: albumId,
      status: "completed"
    }).countDocuments();

    // Get revenue
    const revenue = await Payment.aggregate([
      {
        $match: {
          album: album._id,
          status: "completed"
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" },
          totalSales: { $sum: 1 },
          adminEarnings: { $sum: "$adminShare" },
          photographerEarnings: { $sum: "$photographerShare" }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      album,
      stats: {
        sales: sales,
        ...( revenue[0] || {
          totalRevenue: 0,
          totalSales: 0,
          adminEarnings: 0,
          photographerEarnings: 0
        })
      }
    });
  } catch (error) {
    console.error("[getAlbumDetailsAdmin] Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Admin: Delete media
 */
export async function deleteMediaAdmin(req, res) {
  try {
    const { mediaId } = req.params;
    const { reason } = req.body;

    const media = await Media.findByIdAndDelete(mediaId);
    if (!media) {
      return res.status(404).json({ success: false, message: "Media not found" });
    }

    // Log the deletion
    console.log(`[ADMIN ACTION] Deleted media ${mediaId}. Photographer: ${media.photographer}. Reason: ${reason || "None specified"}`);

    res.status(200).json({ success: true, message: "Media deleted successfully" });
  } catch (error) {
    console.error("[deleteMediaAdmin] Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Admin: Delete album
 */
export async function deleteAlbumAdmin(req, res) {
  try {
    const { albumId } = req.params;
    const { reason } = req.body;

    const album = await Album.findByIdAndDelete(albumId);
    if (!album) {
      return res.status(404).json({ success: false, message: "Album not found" });
    }

    // Remove album reference from media
    await Media.updateMany(
      { album: albumId },
      { $unset: { album: "" } }
    );

    console.log(`[ADMIN ACTION] Deleted album ${albumId}. Photographer: ${album.photographer}. Reason: ${reason || "None specified"}`);

    res.status(200).json({ success: true, message: "Album deleted successfully" });
  } catch (error) {
    console.error("[deleteAlbumAdmin] Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Admin: Get platform statistics
 */
export async function getPlatformStatsAdmin(req, res) {
  try {
    // Total users
    const totalUsers = await User.countDocuments();
    const photographers = await User.countDocuments({ role: "photographer" });
    const buyers = await User.countDocuments({ role: "user" });
    const admins = await User.countDocuments({ role: "admin" });

    // Total content
    const totalMedia = await Media.countDocuments();
    const totalAlbums = await Album.countDocuments();

    // Revenue stats
    const revenueStats = await Payment.aggregate([
      {
        $match: { status: "completed" }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" },
          totalTransactions: { $sum: 1 },
          totalAdminEarnings: { $sum: "$adminShare" },
          totalPhotographerEarnings: { $sum: "$photographerShare" }
        }
      }
    ]);

    // Recent activity
    const recentMedia = await Media.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("photographer", "username")
      .lean();

    const recentAlbums = await Album.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("photographer", "username")
      .lean();

    const recentPayments = await Payment.find({ status: "completed" })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("buyer", "username")
      .lean();

    res.status(200).json({
      success: true,
      users: {
        total: totalUsers,
        photographers,
        buyers,
        admins
      },
      content: {
        totalMedia,
        totalAlbums
      },
      revenue: revenueStats[0] || {
        totalRevenue: 0,
        totalTransactions: 0,
        totalAdminEarnings: 0,
        totalPhotographerEarnings: 0
      },
      activity: {
        recentMedia,
        recentAlbums,
        recentPayments
      }
    });
  } catch (error) {
    console.error("[getPlatformStatsAdmin] Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

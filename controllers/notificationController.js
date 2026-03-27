import Notification from "../models/Notification.js";
import User from "../models/users.js";
import Media from "../models/media.js";
import ShareToken from "../models/ShareToken.js";

// Get user's notifications
export const getNotifications = async (req, res) => {
  try {
    const { limit = 20, skip = 0, unreadOnly = false } = req.query;
    const userId = req.user.id;

    const filter = { recipient: userId };
    if (unreadOnly === "true") filter.isRead = false;

    const notifications = await Notification.find(filter)
      .populate("sender", "name email profilePictureUrl")
      .populate("data.mediaId", "title description type")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean();

    const total = await Notification.countDocuments(filter);
    const unreadCount = await Notification.countDocuments({
      recipient: userId,
      isRead: false,
    });

    res.status(200).json({
      notifications,
      total,
      unreadCount,
      limit: parseInt(limit),
      skip: parseInt(skip),
    });
  } catch (err) {
    console.error("Error fetching notifications:", err);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
};

// Mark notification as read
export const markNotificationAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findOneAndUpdate(
      { _id: id, recipient: userId },
      { isRead: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.status(200).json(notification);
  } catch (err) {
    console.error("Error marking notification as read:", err);
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
};

// Mark all notifications as read for user
export const markAllNotificationsAsRead = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await Notification.updateMany(
      { recipient: userId, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    res.status(200).json({
      message: "All notifications marked as read",
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    console.error("Error marking all notifications as read:", err);
    res.status(500).json({ error: "Failed to mark all notifications as read" });
  }
};

// Delete a notification
export const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await Notification.deleteOne({
      _id: id,
      recipient: userId,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.status(200).json({ message: "Notification deleted" });
  } catch (err) {
    console.error("Error deleting notification:", err);
    res.status(500).json({ error: "Failed to delete notification" });
  }
};

// Send share link to specific user(s)
export const sendShareToUsers = async (req, res) => {
  try {
    const photogId = req.user.id;
    const { shareToken, recipientIds, message = "" } = req.body;

    // Validate
    if (!shareToken || !recipientIds || !Array.isArray(recipientIds) || recipientIds.length === 0) {
      return res.status(400).json({
        error: "Missing shareToken or recipientIds (must be non-empty array)",
      });
    }

    // Get share token details
    const share = await ShareToken.findOne({ token: shareToken }).populate(
      "media",
      "title description type"
    );

    if (!share) {
      return res.status(404).json({ error: "Share token not found" });
    }

    if (share.createdBy.toString() !== photogId) {
      return res.status(403).json({ error: "Not authorized to send this share" });
    }

    // Validate recipients exist
    const recipients = await User.find({ _id: { $in: recipientIds } }).select(
      "_id name email role"
    );

    if (recipients.length === 0) {
      return res.status(404).json({ error: "No valid recipients found" });
    }

    if (recipients.length !== recipientIds.length) {
      console.warn(
        `Only ${recipients.length} of ${recipientIds.length} recipients found`
      );
    }

    // Get photographer name
    const photographer = await User.findById(photogId).select("name");

    // Create notifications for each recipient
    const notifications = await Notification.insertMany(
      recipients.map((recipient) => ({
        recipient: recipient._id,
        sender: photogId,
        type: "share",
        title: `${photographer?.name || "Photographer"} shared media with you`,
        message:
          message ||
          `Check out "${share.media?.title || "shared media"}" - ${
            share.maxDownloads ? `up to ${share.maxDownloads} downloads available` : "unlimited downloads"
          }, expires ${new Date(share.expiresAt).toLocaleDateString()}`,
        data: {
          mediaId: share.media?._id,
          shareToken: shareToken,
        },
        actionUrl: `/share/${shareToken}`,
        actionLabel: "View Media",
        priority: "high",
      }))
    );

    // Update ShareToken with recipients
    if (!share.sentTo) share.sentTo = [];
    share.sentTo.push(
      ...recipientIds.map((id) => ({
        userId: id,
        sentAt: new Date(),
      }))
    );
    await share.save();

    res.status(200).json({
      message: `Share sent to ${notifications.length} recipient(s)`,
      notificationCount: notifications.length,
      shareToken,
    });
  } catch (err) {
    console.error("Error sending share to users:", err);
    res.status(500).json({ error: "Failed to send share to users" });
  }
};

// Search users (for share recipient selection)
export const searchUsers = async (req, res) => {
  try {
    const { query, limit = 10 } = req.query;
    const photogId = req.user.id;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({ error: "Query must be at least 2 characters" });
    }

    // Search by name, email, or phone
    const searchResults = await User.find({
      $and: [
        { _id: { $ne: photogId } }, // Exclude self
        {
          $or: [
            { name: { $regex: query, $options: "i" } },
            { email: { $regex: query, $options: "i" } },
            { phone: { $regex: query, $options: "i" } },
          ],
        },
      ],
    })
      .select("_id name email phone profilePictureUrl role")
      .limit(parseInt(limit))
      .lean();

    res.status(200).json(searchResults);
  } catch (err) {
    console.error("Error searching users:", err);
    res.status(500).json({ error: "Failed to search users" });
  }
};

// Admin: Get all shares for monitoring
export const adminGetAllShares = async (req, res) => {
  try {
    const { photogId, limit = 20, skip = 0 } = req.query;

    // Build filter
    const filter = {};
    if (photogId) filter.createdBy = photogId;

    const shares = await ShareToken.find(filter)
      .populate("createdBy", "name email phone")
      .populate("media", "title type price downloads")
      .select(
        "token media createdBy maxDownloads downloadCount accessCount expiresAt isActive createdAt sentTo"
      )
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean();

    const total = await ShareToken.countDocuments(filter);

    res.status(200).json({
      shares: shares.map((share) => ({
        ...share,
        sentToCount: share.sentTo?.length || 0,
        isExpired: new Date(share.expiresAt) < new Date(),
        remainingDownloads: share.maxDownloads
          ? share.maxDownloads - (share.downloadCount || 0)
          : "unlimited",
      })),
      total,
      limit: parseInt(limit),
      skip: parseInt(skip),
    });
  } catch (err) {
    console.error("Error fetching admin shares:", err);
    res.status(500).json({ error: "Failed to fetch shares" });
  }
};

// Admin: Get unread notification counts for all users
export const adminGetNotificationStats = async (req, res) => {
  try {
    const stats = await Notification.aggregate([
      {
        $group: {
          _id: "$recipient",
          unreadCount: {
            $sum: { $cond: [{ $eq: ["$isRead", false] }, 1, 0] },
          },
          totalCount: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "users",
          let: { userId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$userId"] } } },
            { $project: { name: 1, email: 1, role: 1 } },
          ],
          as: "user",
        },
      },
      {
        $unwind: "$user",
      },
      { $sort: { unreadCount: -1 } },
      { $limit: 50 },
    ]);

    res.status(200).json(stats);
  } catch (err) {
    console.error("Error fetching notification stats:", err);
    res.status(500).json({ error: "Failed to fetch notification stats" });
  }
};

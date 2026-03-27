import User from "../models/users.js";

// ==============================
// Follow a user
// ==============================
export async function followUser(req, res) {
  try {
    const { userId } = req.params; // User to follow
    const followerId = req.user?.userId || req.user?.id || req.user?._id;

    if (!followerId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (followerId === userId) {
      return res.status(400).json({ message: "Cannot follow yourself" });
    }

    // Check if users exist
    const [follower, targetUser] = await Promise.all([
      User.findById(followerId),
      User.findById(userId)
    ]);

    if (!follower || !targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if already following
    if (follower.following.includes(userId)) {
      return res.status(400).json({ message: "Already following this user" });
    }

    // Add to following/followers arrays
    follower.following.push(userId);
    follower.followingCount += 1;

    targetUser.followers.push(followerId);
    targetUser.followersCount += 1;

    await Promise.all([follower.save(), targetUser.save()]);

    res.status(200).json({
      message: "Successfully followed user",
      followingCount: follower.followingCount,
      followersCount: targetUser.followersCount
    });

  } catch (error) {
    console.error("Error following user:", error);
    res.status(500).json({ message: "Error following user", error: error.message });
  }
}

// ==============================
// Unfollow a user
// ==============================
export async function unfollowUser(req, res) {
  try {
    const { userId } = req.params; // User to unfollow
    const followerId = req.user?.userId || req.user?.id || req.user?._id;

    if (!followerId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    // Check if users exist
    const [follower, targetUser] = await Promise.all([
      User.findById(followerId),
      User.findById(userId)
    ]);

    if (!follower || !targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if actually following
    if (!follower.following.includes(userId)) {
      return res.status(400).json({ message: "Not following this user" });
    }

    // Remove from following/followers arrays
    follower.following = follower.following.filter(id => id.toString() !== userId);
    follower.followingCount = Math.max(0, follower.followingCount - 1);

    targetUser.followers = targetUser.followers.filter(id => id.toString() !== followerId);
    targetUser.followersCount = Math.max(0, targetUser.followersCount - 1);

    await Promise.all([follower.save(), targetUser.save()]);

    res.status(200).json({
      message: "Successfully unfollowed user",
      followingCount: follower.followingCount,
      followersCount: targetUser.followersCount
    });

  } catch (error) {
    console.error("Error unfollowing user:", error);
    res.status(500).json({ message: "Error unfollowing user", error: error.message });
  }
}

// ==============================
// Get user's followers
// ==============================
export async function getUserFollowers(req, res) {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId)
      .populate("followers", "username profilePicture")
      .select("followers followersCount");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      followers: user.followers,
      count: user.followersCount
    });

  } catch (error) {
    console.error("Error fetching followers:", error);
    res.status(500).json({ message: "Error fetching followers", error: error.message });
  }
}

// ==============================
// Get users that user is following
// ==============================
export async function getUserFollowing(req, res) {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId)
      .populate("following", "username profilePicture")
      .select("following followingCount");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      following: user.following,
      count: user.followingCount
    });

  } catch (error) {
    console.error("Error fetching following:", error);
    res.status(500).json({ message: "Error fetching following", error: error.message });
  }
}

// ==============================
// Check if user is following another user
// ==============================
export async function isFollowing(req, res) {
  try {
    const { userId } = req.params; // User to check if following
    const followerId = req.user?.userId || req.user?.id || req.user?._id;

    if (!followerId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const follower = await User.findById(followerId).select("following");

    if (!follower) {
      return res.status(404).json({ message: "User not found" });
    }

    const isFollowing = follower.following.includes(userId);

    res.status(200).json({ isFollowing });

  } catch (error) {
    console.error("Error checking follow status:", error);
    res.status(500).json({ message: "Error checking follow status", error: error.message });
  }
}
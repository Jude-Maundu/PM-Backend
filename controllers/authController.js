import User from "../models/users.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import emailService from "../services/emailService.js";

const DEFAULT_WATERMARK = "Relic Snap";

// Register
async function register(req, res) {
  try {
    const { username, email, password, role, phoneNumber } = req.body;

    // Validate required fields
    if (!username || !email || !password || !phoneNumber) {
      return res.status(400).json({ message: "Username, email, password, and phoneNumber are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    // Validate phone number format (should be 254XXXXXXXXX)
    const phoneRegex = /^254\d{9}$/;
    if (!phoneRegex.test(phoneNumber)) {
      return res.status(400).json({
        message: "Invalid phone number format. Use 254XXXXXXXXX (e.g., 254712345678)"
      });
    }

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Handle profile picture if uploaded
    let profilePicture = "";
    if (req.file) {
      profilePicture = `uploads/profiles/${req.file.filename}`;
    }

    // Resolve referral code if provided
    let referredByUserId = null;
    if (req.body.referralCode) {
      const referrer = await User.findOne({ referralCode: req.body.referralCode });
      if (referrer) {
        referredByUserId = referrer._id;
      }
    }

    // Create new user with role
    const newUser = await User.create({
      username,
      email,
      password: hashedPassword,
      profilePicture,
      phoneNumber: phoneNumber || "",
      role: role || "user",
      watermark: req.body.watermark || DEFAULT_WATERMARK,
      ...(referredByUserId ? { referredBy: referredByUserId } : {}),
    });

    // Send welcome email
    try {
      await emailService.sendWelcomeEmail(email, username, role || "user");
      console.log(`✅ Welcome email sent to ${email}`);
    } catch (emailError) {
      console.error(`⚠️ Failed to send welcome email to ${email}:`, emailError.message);
      // Don't fail registration if email fails
    }

    // Generate JWT token (same as login)
    const token = jwt.sign(
      { userId: newUser._id, email: newUser.email, role: newUser.role, tokenVersion: newUser.tokenVersion || 0 },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Remove password from response
    const { password: pw, ...safeData } = newUser._doc;
    return res.status(201).json({ token, user: safeData });
  } catch (error) {
    return res.status(500).json({ error: process.env.NODE_ENV !== "production" ? error.message : undefined });
  }
}

// Login
async function login(req, res) {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid email or password" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: "Invalid email or password" });

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role, tokenVersion: user.tokenVersion || 0 },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const { password: pw, ...safeData } = user._doc;
    return res.status(200).json({ token, user: safeData });
  } catch (error) {
    return res.status(500).json({ error: process.env.NODE_ENV !== "production" ? error.message : undefined });
  }
}

// Google OAuth callback
async function googleAuthCallback(req, res) {
  try {
    if (!req.user) {
      console.error('❌ Google OAuth: req.user is missing in callback!');
      // Try to get user from session (rare, but for debugging)
      if (req.session && req.session.passport && req.session.passport.user) {
        const User = (await import('../models/users.js')).default;
        req.user = await User.findById(req.session.passport.user);
        console.log('✅ Fetched user from session:', req.user && req.user.email);
      }
    }
    const user = req.user;
    if (!user) {
      console.error('❌ Google OAuth: No user found after all attempts.');
      return res.redirect(`${(process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '')}/login?error=auth_failed`);
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role, tokenVersion: user.tokenVersion || 0 },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Redirect to frontend with token
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    const redirectUrl = `${frontendUrl}/auth/google/callback?token=${token}&user=${encodeURIComponent(JSON.stringify({
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      profilePicture: user.profilePicture
    }))}`;

    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Google auth callback error:', error);
    res.redirect(`${(process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '')}/login?error=auth_failed`);
  }
}

// get all users
async function getAllUsers(req, res) {
  try {
    const users = await User.find().select("-password");
    return res.status(200).json(users);
  } catch (error) {
    return res.status(500).json({ error: process.env.NODE_ENV !== "production" ? error.message : undefined });
  }
}

// get one user
async function getUser(req, res) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.watermark || user.watermark.trim() === "") {
      user.watermark = DEFAULT_WATERMARK;
    }

    const { password: pw, ...safeData } = user._doc;
    return res.status(200).json(safeData);
  } catch (error) {
    return res.status(500).json({ error: process.env.NODE_ENV !== "production" ? error.message : undefined });
  }
}

// update user
async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const callerId = req.user?.userId || req.user?.id || req.user?._id;
    const callerRole = req.user?.role;

    // Only the user themselves or an admin may update a profile
    if (callerId?.toString() !== id && callerRole !== 'admin') {
      return res.status(403).json({ message: "Forbidden: you can only update your own profile" });
    }

    const { username, name, email, password, role, phoneNumber, watermark, profilePicture } = req.body;
    const resolvedUsername = username || name;

    // Validate required fields
    if (!resolvedUsername || !email) {
      return res.status(400).json({ message: "Username and email are required" });
    }

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Update fields
    user.username = resolvedUsername;
    user.email = email;
    if (password) {
      user.password = await bcrypt.hash(password, 10);
    }
    // Only admins may change roles
    if (role && callerRole === 'admin') {
      const allowed = ["admin", "photographer", "user", "institution"];
      if (allowed.includes(role)) user.role = role;
    }
    if (phoneNumber !== undefined && phoneNumber !== null) {
      if (phoneNumber === "") {
        user.phoneNumber = "";
      } else {
        // Normalize: strip non-digits, then ensure 254XXXXXXXXX format
        let digits = String(phoneNumber).replace(/\D/g, "");
        if (digits.startsWith("0") && digits.length === 10) digits = "254" + digits.slice(1);
        else if (digits.startsWith("7") && digits.length === 9) digits = "254" + digits;
        else if (digits.startsWith("254") && digits.length === 12) { /* already correct */ }
        const phoneRegex = /^254\d{9}$/;
        if (!phoneRegex.test(digits)) {
          return res.status(400).json({ message: "Invalid phone number. Use format 0712345678 or 254712345678" });
        }
        user.phoneNumber = digits;
      }
    }

    // Handle profile picture upload
    if (req.file) {
      const profilePicUrl = req.file.secure_url || req.file.url || req.file.path || `/uploads/profiles/${req.file.filename}`;
      user.profilePicture = profilePicUrl;
    } else if (typeof profilePicture === 'string' && profilePicture.trim() !== "") {
      user.profilePicture = profilePicture;
    }

    // Update watermark if provided
    if (typeof watermark === 'string' && watermark.trim() !== "") {
      user.watermark = watermark;
    } else if (!user.watermark || user.watermark.trim() === "") {
      user.watermark = DEFAULT_WATERMARK;
    }

    // Update optional user metadata
    if (typeof req.body.location === 'string') {
      user.location = req.body.location;
    }
    if (typeof req.body.bio === 'string') {
      user.bio = req.body.bio;
    }
    if (typeof req.body.website === 'string') {
      user.website = req.body.website;
    }
    if (req.body.social && typeof req.body.social === 'object') {
      user.social = req.body.social;
    }
    if (Array.isArray(req.body.skills)) {
      user.skills = req.body.skills;
    }
    if (Array.isArray(req.body.equipment)) {
      user.equipment = req.body.equipment;
    }

    await user.save();

    const { password: pw, ...safeData } = user._doc;
    return res.status(200).json(safeData);
  } catch (error) {
    return res.status(500).json({ error: process.env.NODE_ENV !== "production" ? error.message : undefined });
  }
}

// delete user
async function DeleteUser(req, res) {
  try {
    const { id } = req.params;
    const callerId = req.user?.userId || req.user?.id || req.user?._id;
    const callerRole = req.user?.role;

    if (callerId?.toString() !== id && callerRole !== 'admin') {
      return res.status(403).json({ message: "Forbidden: you can only delete your own account" });
    }

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    await User.findByIdAndDelete(id);
    return res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error" });
  }
}

// Update photographer phone number
async function updatePhotographerPhone(req, res) {
  try {
    const { id } = req.params;
    const { phoneNumber } = req.body;

    // Validate phone number
    if (!phoneNumber) {
      return res.status(400).json({ message: "Phone number is required" });
    }

    // Validate phone number format (should be 254XXXXXXXXX)
    const phoneRegex = /^254\d{9}$/;
    if (!phoneRegex.test(phoneNumber)) {
      return res.status(400).json({
        message: "Invalid phone number format. Use 254XXXXXXXXX (e.g., 254712345678)"
      });
    }

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Verify user is a photographer
    if (user.role !== "photographer") {
      return res.status(403).json({ message: "Only photographers can set payment phone numbers" });
    }

    user.phoneNumber = phoneNumber;
    await user.save();

    const { password: pw, ...safeData } = user._doc;
    return res.status(200).json({
      message: "Phone number updated successfully",
      user: safeData
    });
  } catch (error) {
    return res.status(500).json({ error: process.env.NODE_ENV !== "production" ? error.message : undefined });
  }
}

// Get current authenticated user
async function getCurrentUser(req, res) {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?._id;
    
    if (!userId) {
      return res.status(401).json({ message: "User ID not found in token" });
    }

    const user = await User.findById(userId).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.watermark || user.watermark.trim() === "") {
      user.watermark = DEFAULT_WATERMARK;
    }

    const { password: pw, ...safeData } = user._doc;
    return res.status(200).json(safeData);
  } catch (error) {
    return res.status(500).json({ error: process.env.NODE_ENV !== "production" ? error.message : undefined });
  }
}

async function changePassword(req, res) {
  try {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current and new password are required" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.password) {
      return res.status(400).json({ message: "Password change is not available for OAuth accounts" });
    }
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(400).json({ message: "Current password is incorrect" });
    user.password = await bcrypt.hash(newPassword, 10);
    user.tokenVersion = (user.tokenVersion || 0) + 1; // invalidate all existing JWTs
    await user.save();
    res.json({ message: "Password changed successfully" });
  } catch (error) {
    res.status(500).json({ error: process.env.NODE_ENV !== "production" ? error.message : undefined });
  }
}

export { register, login, getAllUsers, getUser, updateUser, DeleteUser, updatePhotographerPhone, googleAuthCallback, getCurrentUser, changePassword };

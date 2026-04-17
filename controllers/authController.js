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

    // Create new user with role
    const newUser = await User.create({
      username,
      email,
      password: hashedPassword,
      profilePicture,
      phoneNumber: phoneNumber || "",
      role: role || "user",
      watermark: req.body.watermark || DEFAULT_WATERMARK,
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
      { userId: newUser._id, email: newUser.email, role: newUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Remove password from response
    const { password: pw, ...safeData } = newUser._doc;
    return res.status(201).json({ token, user: safeData });
  } catch (error) {
    return res.status(500).json({ error: error.message });
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
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const { password: pw, ...safeData } = user._doc;
    return res.status(200).json({ token, user: safeData });
  } catch (error) {
    return res.status(500).json({ error: error.message });
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
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=auth_failed`);
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Redirect to frontend with token
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
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
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=auth_failed`);
  }
}

// get all users
async function getAllUsers(req, res) {
  try {
    const users = await User.find().select("-password");
    return res.status(200).json(users);
  } catch (error) {
    return res.status(500).json({ error: error.message });
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
    return res.status(500).json({ error: error.message });
  }
}

// update user
async function updateUser(req, res) {
  try {
    const { id } = req.params;
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
    if (role) {
      user.role = role;
    }
    if (phoneNumber) {
      // Validate phone number format (should be 254XXXXXXXXX)
      const phoneRegex = /^254\d{9}$/;
      if (!phoneRegex.test(phoneNumber)) {
        return res.status(400).json({
          message: "Invalid phone number format. Use 254XXXXXXXXX (e.g., 254712345678)"
        });
      }
      user.phoneNumber = phoneNumber;
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

    await user.save();

    const { password: pw, ...safeData } = user._doc;
    return res.status(200).json(safeData);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

// delete user
async function DeleteUser(req, res) {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    await User.findByIdAndDelete(id);
    return res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
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
    return res.status(500).json({ error: error.message });
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
    return res.status(500).json({ error: error.message });
  }
}

export { register, login, getAllUsers, getUser, updateUser, DeleteUser, updatePhotographerPhone, googleAuthCallback, getCurrentUser };

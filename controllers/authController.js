import User from "../models/users.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

// Register
async function register(req, res) {
  try {
    const { username, email, password, role, phoneNumber } = req.body;

    // Validate required fields
    if (!username || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
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
      role: role || "user"
    });

    // Remove password from response
    const { password: pw, ...safeData } = newUser._doc;
    return res.status(201).json(safeData);
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
    const { username, email, password, role, phoneNumber } = req.body;

    // Validate required fields
    if (!username || !email) {
      return res.status(400).json({ message: "Username and email are required" });
    }

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Update fields
    user.username = username;
    user.email = email;
    if (password) {
      user.password = await bcrypt.hash(password, 10);
    }
    if (role) {
      user.role = role;
    }
    if (phoneNumber) {
      user.phoneNumber = phoneNumber;
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

export { register, login, getAllUsers, getUser, updateUser, DeleteUser, updatePhotographerPhone };

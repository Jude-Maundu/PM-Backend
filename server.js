import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";
import fs from 'fs';
import bcrypt from "bcrypt";
import User from "./models/users.js";

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables FIRST - before anything else
dotenv.config({ path: path.join(__dirname, '.env') });

// Debug: Check if credentials loaded
console.log('=== Environment Variables Loaded ===');
console.log('PORT:', process.env.PORT);
console.log('MONGODB_URI exists:', !!process.env.MONGODB_URI);
console.log('JWT_SECRET exists:', !!process.env.JWT_SECRET);
console.log('MPESA_CONSUMER_KEY exists:', !!process.env.MPESA_CONSUMER_KEY);
console.log('MPESA_SECRET_KEY exists:', !!process.env.MPESA_SECRET_KEY);
console.log('MPESA_PASSKEY exists:', !!process.env.MPESA_PASSKEY);
console.log('===================================');

// Import routers
import authRouter from "./routes/authcontroller.js";
import mediaRouter from "./routes/MediaRoutes.js";
import paymentRouter from "./routes/PayementRoutes.js";
import adminSettingsRouter from "./routes/adminSettings.js";
import { mpesaCallback } from "./controllers/paymentController.js";

console.log("✅ Admin settings router imported", !!adminSettingsRouter);

const app = express();

// ==================== MIDDLEWARE ====================
// CORS configuration
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://pm-frontend-3buw.onrender.com",
      "https://pm-backend-1-u2y3.onrender.com",
      "https://pm-backend-1-0s8f.onrender.com"
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

// Body parsing middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Serve static files from uploads directory
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Create uploads directory if it doesn't exist
const uploadDirs = [
  path.join(__dirname, 'uploads'),
  path.join(__dirname, 'uploads/photos'),
  path.join(__dirname, 'uploads/profiles'),
  path.join(__dirname, 'uploads/videos')
];

uploadDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✅ Created directory: ${dir}`);
  }
});

// ==================== INITIAL SETUP ====================
async function ensureAdminUser() {
  const adminEmail = "admin@gmail.com";
  const adminUsername = "admin";
  const adminPassword = "000000";

  try {
    const existingAdmin = await User.findOne({ email: adminEmail });
    if (existingAdmin) {
      console.log("✅ Admin user already exists:", adminEmail);
      return;
    }

    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    await User.create({
      username: adminUsername,
      email: adminEmail,
      password: hashedPassword,
      role: "admin"
    });

    console.log(`✅ Created admin user: ${adminEmail} (password: ${adminPassword})`);
  } catch (error) {
    console.error("❌ Failed to create admin user:", error);
  }
}

// ==================== TEST ROUTES ====================
app.get("/api/test", (req, res) => {
  res.json({ message: "Hello from the backend!" });
});

app.get("/", (req, res) => {
  res.json({ message: "PhotoMarket API is running" });
});

// ==================== M-PESA MIDDLEWARE ====================
// (M-Pesa token generation is handled in paymentController.js)

// ==================== M-PESA ROUTES ====================
// Callback endpoint for M-Pesa
app.post("/mpesa-callback", mpesaCallback);

// Test token route
app.get("/test-token", async (req, res) => {
  try {
    const secret = process.env.MPESA_SECRET_KEY;
    const consumer = process.env.MPESA_CONSUMER_KEY;

    if (!secret || !consumer) {
      return res.status(500).json({
        success: false,
        error: "Credentials not found in .env file"
      });
    }

    const auth = Buffer.from(`${consumer}:${secret}`).toString("base64");

    const response = await axios.get(
      "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      {
        headers: {
          authorization: `Basic ${auth}`
        }
      }
    );

    res.json({
      success: true,
      message: "Token generated successfully",
      token: response.data.access_token
    });
  } catch (error) {
    console.error("Error:", error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});

// ==================== MAIN APPLICATION ROUTES ====================
app.use("/api/auth", authRouter);
app.use("/api/media", mediaRouter);
app.use("/api/payments", paymentRouter);
app.use("/api/admin", adminSettingsRouter);

// ==================== GLOBAL ERROR HANDLER ====================
app.use((err, req, res, next) => {
  if (err.message === "Malformed part header") {
    return res.status(400).json({
      message:
        "Malformed multipart request. Do not manually set 'Content-Type: multipart/form-data'. Let the client set it.",
    });
  }
  console.error("❌ Server Error:", err);
  res.status(500).json({ message: err.message || "Internal Server Error" });
});

// 404 Handler
app.use((req, res) => {
  console.log(`404: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ message: "Route not found" });
});

// ==================== DATABASE CONNECTION ====================
const mongoURI =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  'mongodb://localhost:27017/photomarket';

async function dbconnection() {
  try {
    // ✅ FIXED: Removed deprecated options
    await mongoose.connect(mongoURI);

    console.log("✅ Connected to MongoDB");

    // Ensure an admin user exists (for initial setup)
    await ensureAdminUser();

    // Start server AFTER successful database connection
    const PORT = process.env.PORT || 4000;
    app.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
      console.log(`📝 Test API: http://localhost:${PORT}/api/test`);
      console.log(`💰 M-Pesa Test Token: http://localhost:${PORT}/test-token`);
      console.log(`📲 STK Push: POST http://localhost:${PORT}/stk`);
    });
    
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
}

dbconnection();
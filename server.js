import express from "express";
import { createServer } from "http";
import mongoose from "mongoose";
import cors from "cors";
import session from "express-session";
import dotenv from "dotenv";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";
import fs from 'fs';
import bcrypt from "bcrypt";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import User from "./models/users.js";

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

// Import routers
import authRouter from "./routes/authcontroller.js";
import mediaRouter from "./routes/MediaRoutes.js";
import paymentRouter from "./routes/PayementRoutes.js";
import adminSettingsRouter from "./routes/adminSettings.js";
import adminRoutes from "./routes/adminRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import shareRoutes from "./routes/shareRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import messagingRoutes from "./routes/messagingRoutes.js";
import mpesaDiagnosticsRoutes from "./routes/mpesaDiagnosticsRoutes.js";
import withdrawalRoutes from "./routes/withdrawalRoutes.js";
import { processPendingB2cRetries } from "./controllers/paymentController.js";
import emailService from "./services/emailService.js";
import { initializeSocket } from "./services/socketService.js";

console.log("✅ Admin settings router imported", !!adminSettingsRouter);
console.log("✅ User routes router imported", !!userRoutes);

const app = express();

// If running behind a proxy (e.g., Render), trust the X-Forwarded-* headers.
app.set('trust proxy', true);

// ==================== MIDDLEWARE ====================
// Security headers
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { message: "Too many requests, please try again later." }
});
app.use("/api", limiter);

// CORS configuration
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://pm-frontend-3buw.onrender.com",
      "https://pm-frontend-f3b6.onrender.com",
      "https://pm-backend-1-u2y3.onrender.com",
      "https://pm-backend-1-0s8f.onrender.com",
      /^https:\/\/pm-frontend.*\.onrender\.com$/
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

// Session middleware for OAuth
app.use(
  session({
    secret: process.env.JWT_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  })
);

// Body parsing middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Serve static files from uploads directory with CORS headers
app.use("/uploads", (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
}, express.static(path.join(__dirname, "uploads")));

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

// ==================== EMAIL SERVICE INITIALIZATION ====================
console.log('🔧 Initializing email service...');
try {
  const emailInitialized = emailService.initializeTransporter();
  if (emailInitialized) {
    console.log('✅ Email service initialized successfully');
  } else {
    console.warn('⚠️ Email service initialization failed - emails may not work');
  }
} catch (error) {
  console.error('❌ Error initializing email service:', error.message);
}

// ==================== PASSPORT INITIALIZATION ====================
console.log('🔧 Initializing Passport...');
import passport from './config/passport.js';
app.use(passport.initialize());
app.use(passport.session());
console.log('✅ Passport initialized successfully');

// ==================== INITIAL SETUP ====================
async function ensureAdminUser() {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@photomarket.com";
  const adminUsername = process.env.ADMIN_USERNAME || "admin";
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    console.warn("⚠️ ADMIN_PASSWORD not set in .env — skipping admin user creation");
    return;
  }

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
// (M-Pesa token generation and callbacks are handled in paymentController.js)
// Callback route is at: POST /api/payments/callback

// ==================== TEST TOKEN ROUTE ====================
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
app.use("/api/admin", adminRoutes);
app.use("/api/users", userRoutes);
app.use("/api/share", shareRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/messages", messagingRoutes);
app.use("/api/mpesa", mpesaDiagnosticsRoutes);
app.use("/api/withdrawals", withdrawalRoutes);

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

// ------------------- Serve React frontend (fallback for client-side routing) -------------------
const frontendBuildPath = path.join(__dirname, "../PM-Frontend/build");
const frontendIndexPath = path.join(frontendBuildPath, "index.html");

if (fs.existsSync(frontendBuildPath)) {
  console.log(`✅ Serving React frontend from: ${frontendBuildPath}`);
  app.use(express.static(frontendBuildPath));

  // FIXED: Use middleware instead of route for catch-all
  // This avoids the path-to-regexp error entirely
  app.use((req, res, next) => {
    // Skip API routes
    if (req.originalUrl.startsWith("/api")) {
      return next();
    }
    // Skip if the request looks like a file with extension
    if (path.extname(req.path) !== '') {
      return next();
    }
    // Send the React index.html for all other routes
    return res.sendFile(frontendIndexPath);
  });
} else {
  console.log(`⚠️ Frontend build not found at: ${frontendBuildPath}`);
  console.log("📦 Make sure to run 'npm run build' in the frontend directory");
  app.use((req, res) => {
    console.log(`404: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ message: "Route not found" });
  });
}

// ==================== DATABASE CONNECTION ====================
const mongoURI =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  'mongodb://localhost:27017/photomarket';

async function dbconnection() {
  try {
    await mongoose.connect(mongoURI);

    console.log("✅ Connected to MongoDB");

    // Ensure an admin user exists (for initial setup)
    await ensureAdminUser();

    // Start server AFTER successful database connection
    const PORT = process.env.PORT || 4000;
    const httpServer = createServer(app);

    // Initialize Socket.IO
    initializeSocket(httpServer);

    httpServer.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
      console.log(`📝 Test API: http://localhost:${PORT}/api/test`);
      console.log(`💰 M-Pesa Test Token: http://localhost:${PORT}/test-token`);
      console.log(`📲 STK Push: POST http://localhost:${PORT}/api/payments/mpesa`);
      console.log(`📞 M-Pesa Callback: POST http://localhost:${PORT}/api/payments/callback`);

      // Start MPesa retry worker
      setInterval(() => {
        processPendingB2cRetries();
      }, 1000 * 60); // every 1 minute

      console.log(`⏳ MPesa retry worker started (every 60 sec)`);
    });
    
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
}

dbconnection();
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

import authRouter from "./routes/authcontroller.js";
import mediaRouter from "./routes/MediaRoutes.js";
import paymentRouter from "./routes/PayementRoutes.js";

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();

// Middleware
// In your backend server.js
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://pm-frontend-3buw.onrender.com", // Your frontend URL
      "https://pm-backend-1-u2y3.onrender.com", // Optional: allow backend itself
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  }),
);
app.use(express.json({ limit: "10mb" }));

// Serve uploads folder
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Test route
app.get("/api/test", (req, res) => {
  res.json({ message: "Hello from the backend!" });
});

// Routes
app.use("/api/auth", authRouter);
app.use("/api/media", mediaRouter);
app.use("/api/payments", paymentRouter);

// Global Error Handler
app.use((err, req, res, next) => {
  if (err.message === "Malformed part header") {
    return res.status(400).json({
      message:
        "Malformed multipart request. Do not manually set 'Content-Type: multipart/form-data'. Let the client set it.",
    });
  }
  console.error(err);
  res.status(500).json({ message: err.message || "Internal Server Error" });
});

// 404 Handler
app.use((req, res) => {
  console.log(`404: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ message: "Route not found" });
});

// MongoDB Connection
const db = process.env.MONGO_URI;

async function dbconnection() {
  try {
    await mongoose.connect(db);

    console.log("Connected to MongoDB");

    app.listen(4000, () => {
      console.log("Server running at http://localhost:4000");
    });
  } catch (error) {
    console.error("MongoDB connection error:", error);
  }
}

dbconnection();

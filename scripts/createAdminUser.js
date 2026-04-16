import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import User from "../models/users.js";

dotenv.config();

const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/photomarket';

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

const email = getArgValue("--email") || process.env.ADMIN_EMAIL || "admin@photomarket.com";
const username = getArgValue("--username") || process.env.ADMIN_USERNAME || "admin";
const password = getArgValue("--password") || process.env.ADMIN_PASSWORD;

if (!password) {
  console.error("❌ Please provide an admin password using --password or ADMIN_PASSWORD in .env.");
  process.exit(1);
}

async function createAdminUser() {
  try {
    await mongoose.connect(mongoURI);
    console.log(`🔐 Connected to MongoDB at ${mongoURI}`);

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      console.log(`⚠️ Admin user already exists with email or username: ${email} / ${username}`);
      process.exit(0);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const adminUser = await User.create({
      username,
      email,
      password: hashedPassword,
      role: "admin",
      isVerified: true,
      isActive: true
    });

    console.log("✅ Admin user created successfully:", {
      email: adminUser.email,
      username: adminUser.username,
      role: adminUser.role
    });
    process.exit(0);
  } catch (error) {
    console.error("❌ Failed to create admin user:", error);
    process.exit(1);
  }
}

createAdminUser();

import mongoose from "mongoose";
import dotenv from "dotenv";
import Notification from "../models/Notification.js";
import User from "../models/users.js";

dotenv.config();

const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/photomarket';

async function createTestNotification() {
  await mongoose.connect(mongoURI);

  // Find any user (or specify a user ID/email here)
  const user = await User.findOne();
  if (!user) {
    console.error("No user found in the database.");
    process.exit(1);
  }

  // Use the same user as sender for test
  const notification = await Notification.create({
    recipient: user._id,
    sender: user._id,
    type: "system",
    title: "Test Notification",
    message: "This is a test notification created by script.",
    data: {},
    actionUrl: "/dashboard",
    actionLabel: "Go to Dashboard",
    priority: "normal"
  });

  console.log("Test notification created:", notification);
  process.exit(0);
}

createTestNotification();

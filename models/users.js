import mongoose from "mongoose";
const { Schema } = mongoose;

const userSchema = new Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  profilePicture: { type: String, default: "" },
  role: {
    type: String,
    enum: ["admin", "photographer", "user"], // allowed roles
    default: "user" // fallback role if none provided
  }
}, { timestamps: true });

const User = mongoose.model("User", userSchema);

export default User;
 
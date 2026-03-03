import mongoose from "mongoose";
const { Schema } = mongoose;

const userSchema = new Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  profilePicture: { type: String, default: "" },
  phoneNumber: { type: String, default: "" }, // For photographers to receive payments
  role: {
    type: String,
    enum: ["admin", "photographer", "user"],
    default: "user"
  }
}, { timestamps: true });

const User = mongoose.model("User", userSchema);

export default User;
 
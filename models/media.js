import mongoose from "mongoose";

const mediaSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  price: { type: Number, default: 0 },
  fileUrl: { type: String, required: true }, 
  mediaType: { type: String, enum: ["photo", "video"], required: true },
  album: { type: mongoose.Schema.Types.ObjectId, ref: "Album", default: null },
  photographer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  views: { type: Number, default: 0 },
  likes: { type: Number, default: 0 },
  downloads: { type: Number, default: 0 },
  comments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Comment" }], 
}, { timestamps: true });

const Media = mongoose.model("Media", mediaSchema);

export default Media;

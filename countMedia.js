import mongoose from "mongoose";
import Media from "./models/media.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const mongoURI =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  'mongodb://localhost:27017/photomarket';

mongoose.connect(mongoURI).then(async () => {
  const count = await Media.countDocuments();
  console.log('Remaining media:', count);
  await mongoose.disconnect();
});
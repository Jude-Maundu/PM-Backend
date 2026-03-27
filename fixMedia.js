import mongoose from "mongoose";
import Media from "./models/media.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const mongoURI =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  'mongodb://localhost:27017/photomarket';

const fixFileUrls = async () => {
  try {
    await mongoose.connect(mongoURI);

    const allMedia = await Media.find();

    console.log(`Found ${allMedia.length} total media`);

    for (const media of allMedia) {
      const normalizedUrl = media.fileUrl.startsWith('/uploads/') ? media.fileUrl : `/uploads/photos/${media.fileUrl}`;
      const filePath = path.join(__dirname, normalizedUrl);
      if (!fs.existsSync(filePath)) {
        console.log(`File does not exist: ${filePath} for media ${media._id}, deleting`);
        await Media.findByIdAndDelete(media._id);
      }
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error("Error fixing fileUrls:", error);
  }
};

fixFileUrls();
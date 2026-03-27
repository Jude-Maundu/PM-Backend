import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Cloudinary with environment config (CLOUDINARY_URL or explicit vars)
cloudinary.config({
  secure: true,
});

// Helper to ensure directory exists
const ensureDir = (dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

// Configure local disk storage
const localStorage = (folderName) => multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, `../uploads/${folderName}`);
        ensureDir(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

// Configure Cloudinary storage if CLOUDINARY_URL is set.
const cloudinaryStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: 'photomarket',
    resource_type: file.mimetype.startsWith('video/') ? 'video' : 'image',
    format: 'auto',
    public_id: `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
  }),
});

// Helper to choose storage engine
const chooseStorage = (folderName) => {
  if (process.env.CLOUDINARY_URL) {
    return cloudinaryStorage;
  }
  return localStorage(folderName);
};

// Export two separate upload middleware instances
export const uploadPhoto = multer({ storage: chooseStorage('photos') });
export const uploadProfile = multer({ storage: chooseStorage('profiles') });

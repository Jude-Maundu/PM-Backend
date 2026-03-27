import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to ensure directory exists
const ensureDir = (dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

// Configure local disk storage (fall-back)
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

// Configure Cloudinary
const useCloudinary = !!process.env.CLOUDINARY_URL || (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

if (useCloudinary) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

const cloudinaryStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'pm-uploads',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'mp4', 'mov', 'webm'],
    resource_type: 'auto'
  }
});

// Export uploader instances
export const uploadPhoto = useCloudinary
  ? multer({ storage: cloudinaryStorage })
  : multer({ storage: localStorage('photos') });

export const uploadProfile = useCloudinary
  ? multer({ storage: cloudinaryStorage })
  : multer({ storage: localStorage('profiles') });


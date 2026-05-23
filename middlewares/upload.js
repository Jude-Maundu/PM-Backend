import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

// Allowed extensions and MIME types
const ALLOWED_EXTENSIONS = /jpg|jpeg|png|gif|mp4|mov|webm|webp/i;
const ALLOWED_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/quicktime', 'video/webm',
]);

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
  if (ALLOWED_EXTENSIONS.test(ext) && ALLOWED_MIMES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed. Accepted: jpg, jpeg, png, gif, webp, mp4, mov, webm`), false);
  }
};

// Local disk storage (fallback when Cloudinary is not configured)
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
const useCloudinary = !!process.env.CLOUDINARY_URL ||
  (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

if (useCloudinary) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

const cloudinaryStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'pm-uploads',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'mp4', 'mov', 'webm', 'webp'],
    resource_type: 'auto',
  },
});

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB for photos/videos

export const uploadPhoto = useCloudinary
  ? multer({ storage: cloudinaryStorage, fileFilter, limits: { fileSize: MAX_FILE_SIZE } })
  : multer({ storage: localStorage('photos'), fileFilter, limits: { fileSize: MAX_FILE_SIZE } });

export const uploadProfile = useCloudinary
  ? multer({ storage: cloudinaryStorage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } })
  : multer({ storage: localStorage('profiles'), fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

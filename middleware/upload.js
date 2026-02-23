import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to ensure directory exists
const ensureDir = (dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

// Configure storage dynamically based on the folder name
const storage = (folderName) => multer.diskStorage({
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

// Export two separate instances
export const uploadPhoto = multer({ storage: storage('photos') });
export const uploadProfile = multer({ storage: storage('profiles') });

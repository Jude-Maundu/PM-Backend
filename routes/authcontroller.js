import express from 'express';

import {register, login} from '../controllers/authController.js';
import { uploadProfile } from '../middlewares/upload.js';
import { getAllUsers, getUser, updateUser, DeleteUser } from '../controllers/authController.js';

const router = express.Router();

router.post('/register', uploadProfile.single('profilePicture'), register);
router.post('/login', login);
router.get('/users', getAllUsers);
router.get('/users/:id', getUser);
router.put('/users/:id', uploadProfile.single('profilePicture'), updateUser);
router.delete('/users/:id', DeleteUser);

export default router;
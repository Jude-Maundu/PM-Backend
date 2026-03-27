import express from 'express';
import { authenticate } from '../middlewares/auth.js';
import { requirePhotographer } from '../middlewares/photographer.js';
import { requireAdmin } from '../middlewares/admin.js';
import {
  requestWithdrawal,
  getPhotographerWithdrawals,
  getAllWithdrawals,
  processWithdrawal
} from '../controllers/withdrawalController.js';

const router = express.Router();

// Photographer routes
router.post('/request', authenticate, requirePhotographer, requestWithdrawal);
router.get('/my', authenticate, requirePhotographer, getPhotographerWithdrawals);

// Admin routes
router.get('/all', authenticate, requireAdmin, getAllWithdrawals);
router.put('/:withdrawalId/process', authenticate, requireAdmin, processWithdrawal);

export default router;
import express from 'express';
import { authenticate } from '../middlewares/auth.js';
import { requirePhotographer } from '../middlewares/photographer.js';
import { requireAdmin } from '../middlewares/admin.js';
import {
  requestWithdrawalMfa,
  requestWithdrawal,
  getPhotographerWithdrawals,
  getAllWithdrawals,
  processWithdrawal,
  b2cWithdrawalCallback,
  b2cWithdrawalTimeout,
} from '../controllers/withdrawalController.js';

const router = express.Router();

// Safaricom B2C callbacks — unauthenticated (Safaricom POSTs here)
router.post('/b2c-callback', b2cWithdrawalCallback);
router.post('/b2c-timeout', b2cWithdrawalTimeout);

// Photographer routes
router.post('/request-mfa', authenticate, requirePhotographer, requestWithdrawalMfa);
router.post('/request', authenticate, requirePhotographer, requestWithdrawal);
router.get('/my', authenticate, requirePhotographer, getPhotographerWithdrawals);

// Admin routes
router.get('/all', authenticate, requireAdmin, getAllWithdrawals);
router.put('/:withdrawalId/process', authenticate, requireAdmin, processWithdrawal);

export default router;

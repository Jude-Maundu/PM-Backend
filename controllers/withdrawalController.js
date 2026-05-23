import Withdrawal from '../models/Withdrawal.js';
import User from '../models/users.js';
import Wallet from '../models/Wallet.js';
import { sendMoneyToPhotographer } from './paymentController.js';
import { emitToUser } from '../services/socketService.js';

// ==============================
// Request withdrawal + immediate B2C payout
// ==============================
export async function requestWithdrawal(req, res) {
  try {
    const photographerId = req.user?.userId || req.user?.id || req.user?._id;
    const { amount, method, phoneNumber, accountName, accountNumber } = req.body;

    if (!photographerId) return res.status(401).json({ message: 'Authentication required' });

    if (!amount || Number(amount) < 1) {
      return res.status(400).json({ message: 'Invalid withdrawal amount' });
    }

    const photographer = await User.findById(photographerId);
    if (!photographer) return res.status(404).json({ message: 'Photographer not found' });

    // Verify wallet balance
    const wallet = await Wallet.findOne({ user: photographerId });
    const available = wallet?.balance || 0;
    if (available < Number(amount)) {
      return res.status(402).json({
        message: `Insufficient balance. Available: KES ${available.toLocaleString()}, Requested: KES ${Number(amount).toLocaleString()}`
      });
    }

    // Normalise phone number for M-Pesa
    let normalizedPhone = phoneNumber;
    if (method === 'mpesa') {
      if (!phoneNumber) return res.status(400).json({ message: 'Phone number is required for M-Pesa withdrawal' });
      normalizedPhone = String(phoneNumber).replace(/[^0-9]/g, '');
      if (normalizedPhone.startsWith('0') && normalizedPhone.length === 10) normalizedPhone = '254' + normalizedPhone.slice(1);
      if (normalizedPhone.startsWith('7') && normalizedPhone.length === 9) normalizedPhone = '254' + normalizedPhone;
      if (!/^254\d{9}$/.test(normalizedPhone)) {
        return res.status(400).json({ message: 'Invalid phone number. Use 254712345678 or 0712345678' });
      }
    }

    // Create withdrawal record (status: processing for M-Pesa, pending for bank)
    const withdrawal = await Withdrawal.create({
      photographer: photographerId,
      amount: Number(amount),
      method,
      phoneNumber: method === 'mpesa' ? normalizedPhone : undefined,
      accountName: method === 'bank' ? accountName : undefined,
      accountNumber: method === 'bank' ? accountNumber : undefined,
      status: method === 'mpesa' ? 'processing' : 'pending',
    });

    if (method === 'mpesa') {
      // Deduct wallet immediately so balance is locked
      wallet.balance -= Number(amount);
      wallet.transactions = wallet.transactions || [];
      wallet.transactions.push({
        type: 'debit',
        amount: Number(amount),
        description: `M-Pesa withdrawal — ${withdrawal.reference}`,
        reference: withdrawal.reference,
        createdAt: new Date(),
      });
      await wallet.save();

      // Trigger B2C payout
      const b2cResult = await sendMoneyToPhotographer(
        req,
        normalizedPhone,
        Number(amount),
        withdrawal.reference,
        `Withdrawal — PhotoMarket`,
        null
      );

      if (b2cResult.success) {
        // Store Safaricom conversation IDs for callback matching
        withdrawal.mpesaConversationId = b2cResult.data?.ConversationID;
        withdrawal.mpesaOriginatorId = b2cResult.data?.OriginatorConversationID;
        await withdrawal.save();

        // Notify via socket
        try {
          emitToUser(photographerId.toString(), 'withdrawal:processing', {
            withdrawalId: withdrawal._id,
            amount: Number(amount),
            phone: normalizedPhone,
            message: `KES ${Number(amount).toLocaleString()} is being sent to ${normalizedPhone}. You will receive an M-Pesa notification shortly.`,
          });
        } catch (_) {}

        return res.status(201).json({
          success: true,
          message: `KES ${Number(amount).toLocaleString()} is being sent to ${normalizedPhone}. Check your M-Pesa for a confirmation SMS.`,
          withdrawal,
          b2c: { conversationId: b2cResult.data?.ConversationID },
        });
      } else {
        // B2C failed — refund wallet and mark withdrawal failed
        wallet.balance += Number(amount);
        wallet.transactions.push({
          type: 'credit',
          amount: Number(amount),
          description: `Withdrawal reversal — B2C failed (${withdrawal.reference})`,
          reference: withdrawal.reference,
          createdAt: new Date(),
        });
        await wallet.save();

        withdrawal.status = 'failed';
        withdrawal.notes = `B2C initiation failed: ${JSON.stringify(b2cResult.error)}`;
        await withdrawal.save();

        return res.status(502).json({
          success: false,
          message: 'M-Pesa payout failed to initiate. Your balance has been restored. Please try again.',
          error: process.env.NODE_ENV !== 'production' ? b2cResult.error : undefined,
        });
      }
    }

    // Bank transfer — just queue it for admin processing
    return res.status(201).json({
      success: true,
      message: 'Bank transfer request submitted. An admin will process it within 1-3 business days.',
      withdrawal,
    });

  } catch (error) {
    console.error('Error requesting withdrawal:', error);
    res.status(500).json({
      message: 'Error processing withdrawal request',
      error: process.env.NODE_ENV !== 'production' ? error.message : undefined,
    });
  }
}

// ==============================
// B2C result callback from Safaricom
// POST /api/withdrawals/b2c-callback
// ==============================
export async function b2cWithdrawalCallback(req, res) {
  try {
    const result = req.body?.Result;
    if (!result) return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });

    const conversationId = result.ConversationID;
    const resultCode = result.ResultCode;
    const resultDesc = result.ResultDesc;

    const withdrawal = await Withdrawal.findOne({ mpesaConversationId: conversationId });
    if (!withdrawal) {
      console.warn('[b2cWithdrawalCallback] No withdrawal found for ConversationID:', conversationId);
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    if (resultCode === 0) {
      // Success — extract receipt
      const items = result.ResultParameters?.ResultParameter || [];
      const receiptItem = items.find(i => i.Key === 'TransactionReceipt');
      withdrawal.status = 'completed';
      withdrawal.processedAt = new Date();
      if (receiptItem) withdrawal.mpesaReceiptNumber = receiptItem.Value;
      await withdrawal.save();

      try {
        emitToUser(withdrawal.photographer.toString(), 'withdrawal:completed', {
          withdrawalId: withdrawal._id,
          amount: withdrawal.amount,
          receipt: receiptItem?.Value,
          message: `KES ${withdrawal.amount.toLocaleString()} successfully sent to your M-Pesa.`,
        });
      } catch (_) {}

    } else {
      // Failed — refund wallet
      withdrawal.status = 'failed';
      withdrawal.notes = `B2C callback failed: ${resultDesc}`;
      withdrawal.processedAt = new Date();
      await withdrawal.save();

      const wallet = await Wallet.findOne({ user: withdrawal.photographer });
      if (wallet) {
        wallet.balance += withdrawal.amount;
        wallet.transactions = wallet.transactions || [];
        wallet.transactions.push({
          type: 'credit',
          amount: withdrawal.amount,
          description: `Withdrawal reversal — M-Pesa failed (${withdrawal.reference})`,
          reference: withdrawal.reference,
          createdAt: new Date(),
        });
        await wallet.save();
      }

      try {
        emitToUser(withdrawal.photographer.toString(), 'withdrawal:failed', {
          withdrawalId: withdrawal._id,
          amount: withdrawal.amount,
          message: `Withdrawal failed: ${resultDesc}. Your balance has been restored.`,
        });
      } catch (_) {}
    }

    res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (err) {
    console.error('[b2cWithdrawalCallback] error:', err);
    res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' }); // always 200 to Safaricom
  }
}

// ==============================
// B2C timeout callback from Safaricom
// POST /api/withdrawals/b2c-timeout
// ==============================
export async function b2cWithdrawalTimeout(req, res) {
  try {
    const originatorId = req.body?.Result?.OriginatorConversationID;
    if (originatorId) {
      const withdrawal = await Withdrawal.findOne({ mpesaOriginatorId: originatorId });
      if (withdrawal && withdrawal.status === 'processing') {
        withdrawal.status = 'failed';
        withdrawal.notes = 'B2C request timed out';
        await withdrawal.save();

        const wallet = await Wallet.findOne({ user: withdrawal.photographer });
        if (wallet) {
          wallet.balance += withdrawal.amount;
          await wallet.save();
        }
      }
    }
  } catch (err) {
    console.error('[b2cWithdrawalTimeout] error:', err);
  }
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
}

// ==============================
// Get photographer's withdrawals
// ==============================
export async function getPhotographerWithdrawals(req, res) {
  try {
    const photographerId = req.user?.userId || req.user?.id || req.user?._id;
    if (!photographerId) return res.status(401).json({ message: 'Authentication required' });

    const withdrawals = await Withdrawal.find({ photographer: photographerId }).sort({ createdAt: -1 });
    res.status(200).json(withdrawals);
  } catch (error) {
    console.error('Error fetching withdrawals:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

// ==============================
// Get all withdrawals (admin)
// ==============================
export async function getAllWithdrawals(req, res) {
  try {
    const withdrawals = await Withdrawal.find()
      .populate('photographer', 'username email')
      .sort({ createdAt: -1 });
    res.status(200).json(withdrawals);
  } catch (error) {
    console.error('Error fetching all withdrawals:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

// ==============================
// Process withdrawal (admin — for bank transfers only)
// ==============================
export async function processWithdrawal(req, res) {
  try {
    const { withdrawalId } = req.params;
    const { status, notes } = req.body;

    const withdrawal = await Withdrawal.findById(withdrawalId);
    if (!withdrawal) return res.status(404).json({ message: 'Withdrawal not found' });

    withdrawal.status = status;
    if (status === 'completed' || status === 'failed') withdrawal.processedAt = new Date();
    if (notes) withdrawal.notes = notes;
    await withdrawal.save();

    res.status(200).json({ message: `Withdrawal ${status} successfully`, withdrawal });
  } catch (error) {
    console.error('Error processing withdrawal:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

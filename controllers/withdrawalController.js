import Withdrawal from '../models/Withdrawal.js';
import User from '../models/users.js';

// ==============================
// Request withdrawal
// ==============================
export async function requestWithdrawal(req, res) {
  try {
    const photographerId = req.user?.userId || req.user?.id || req.user?._id;
    const { amount, method, phoneNumber, accountName, accountNumber } = req.body;

    if (!photographerId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!amount || amount < 1000) {
      return res.status(400).json({ message: 'Minimum withdrawal amount is KES 1,000' });
    }

    // Check if photographer has sufficient earnings
    // For now, we'll allow the request - in production you'd check actual earnings
    const photographer = await User.findById(photographerId);
    if (!photographer) {
      return res.status(404).json({ message: 'Photographer not found' });
    }

    // Create withdrawal request
    const withdrawal = await Withdrawal.create({
      photographer: photographerId,
      amount,
      method,
      phoneNumber: method === 'mpesa' ? phoneNumber : undefined,
      accountName: method === 'bank' ? accountName : undefined,
      accountNumber: method === 'bank' ? accountNumber : undefined,
      status: 'pending'
    });

    res.status(201).json({
      message: 'Withdrawal request submitted successfully',
      withdrawal
    });

  } catch (error) {
    console.error('Error requesting withdrawal:', error);
    res.status(500).json({
      message: 'Error requesting withdrawal',
      error: error.message
    });
  }
}

// ==============================
// Get photographer's withdrawals
// ==============================
export async function getPhotographerWithdrawals(req, res) {
  try {
    const photographerId = req.user?.userId || req.user?.id || req.user?._id;

    if (!photographerId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const withdrawals = await Withdrawal.find({ photographer: photographerId })
      .sort({ createdAt: -1 });

    res.status(200).json(withdrawals);

  } catch (error) {
    console.error('Error fetching withdrawals:', error);
    res.status(500).json({
      message: 'Error fetching withdrawals',
      error: error.message
    });
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
    res.status(500).json({
      message: 'Error fetching withdrawals',
      error: error.message
    });
  }
}

// ==============================
// Process withdrawal (admin)
// ==============================
export async function processWithdrawal(req, res) {
  try {
    const { withdrawalId } = req.params;
    const { status, notes } = req.body;

    const withdrawal = await Withdrawal.findById(withdrawalId);
    if (!withdrawal) {
      return res.status(404).json({ message: 'Withdrawal not found' });
    }

    withdrawal.status = status;
    if (status === 'completed' || status === 'failed') {
      withdrawal.processedAt = new Date();
    }
    if (notes) {
      withdrawal.notes = notes;
    }

    await withdrawal.save();

    res.status(200).json({
      message: `Withdrawal ${status} successfully`,
      withdrawal
    });

  } catch (error) {
    console.error('Error processing withdrawal:', error);
    res.status(500).json({
      message: 'Error processing withdrawal',
      error: error.message
    });
  }
}
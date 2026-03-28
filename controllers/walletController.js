import User from "../models/users.js";
import Media from "../models/media.js";
import Payment from "../models/Payment.js";
import Refund from "../models/Refund.js";
import Wallet from "../models/Wallet.js";

// ==============================
// Get wallet balance
// ==============================
export async function getWalletBalance(req, res) {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      wallet = await Wallet.create({ user: userId, balance: 0 });
    }

    res.status(200).json({
      userId,
      balance: wallet.balance,
      totalSpent: 0,
      totalRefunded: 0,
      netBalance: wallet.balance
    });
  } catch (error) {
    console.error("Error fetching wallet balance:", error);
    res.status(500).json({
      message: "Error fetching wallet balance",
      error: error.message
    });
  }
}

// ==============================
// Get transactions (payments for buyer or earnings for photographer)
// ==============================
export async function getTransactions(req, res) {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    let transactions = [];

    if (user.role === "photographer") {
      // Get earnings for photographer
      const mediaItems = await Media.find({ photographer: userId }).select("_id");
      const mediaIds = mediaItems.map((m) => m._id);

      const payments = mediaIds.length > 0
        ? await Payment.find({ media: { $in: mediaIds }, status: "completed" })
            .populate("media", "title price")
            .populate("buyer", "username email")
            .sort({ createdAt: -1 })
        : [];

      transactions = payments.map((p) => ({
        id: p._id,
        type: "earnings",
        amount: p.photographerShare,
        description: `Earnings from ${p.buyer?.username || 'Unknown'} for ${p.media?.title}`,
        date: p.createdAt,
        status: "completed",
        reference: p._id,
        buyer: p.buyer || null,
        mediaTitle: p.media?.title || null
      }));
    } else if (user.role === "buyer") {
      // Get purchases and topups for buyer
      const payments = await Payment.find({
        buyer: userId,
        status: "completed"
      })
        .populate("media", "title price")
        .sort({ createdAt: -1 });

      transactions = payments.map(p => ({
        id: p._id,
        type: p.media ? "purchase" : "topup",
        amount: p.media ? p.amount * -1 : p.amount,
        description: p.media ? `Purchase: ${p.media?.title}` : `Wallet topup via ${p.paymentMethod}`,
        date: p.createdAt,
        status: "completed",
        reference: p._id
      }));
    }

    res.status(200).json(transactions);
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({
      message: "Error fetching transactions",
      error: error.message
    });
  }
}

// ==============================
// Add funds to wallet (manual / mock)
// ==============================
export async function addFundsToWallet(req, res) {
  try {
    const { userId, amount } = req.body;

    if (!userId || !amount || amount <= 0) {
      return res.status(400).json({
        message: "Invalid userId or amount"
      });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      wallet = await Wallet.create({ user: userId, balance: 0 });
    }

    wallet.balance += Number(amount);
    await wallet.save();

    res.status(200).json({
      message: "Funds added successfully",
      amount,
      newBalance: wallet.balance
    });
  } catch (error) {
    console.error("Error adding funds:", error);
    res.status(500).json({
      message: "Error adding funds",
      error: error.message
    });
  }
}

export default {
  getWalletBalance,
  getTransactions,
  addFundsToWallet
};

import User from "../models/users.js";
import Payment from "../models/Payment.js";
import Refund from "../models/Refund.js";

// ==============================
// Get wallet balance
// ==============================
export async function getWalletBalance(req, res) {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Get completed payments for this buyer
    const payments = await Payment.find({ 
      buyer: userId, 
      status: "completed" 
    });

    // Get pending or approved refunds
    const refunds = await Refund.find({
      buyer: userId,
      status: { $in: ["approved", "processed"] }
    });

    // Calculate balance (total spent)
    const totalSpent = payments.reduce((sum, p) => sum + p.amount, 0);
    const totalRefunded = refunds.reduce((sum, r) => sum + r.amount, 0);
    const balance = 0; // Wallets start at 0, users add money via Mpesa

    res.status(200).json({
      userId,
      balance,
      totalSpent,
      totalRefunded,
      netBalance: balance - totalSpent + totalRefunded
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
      const payments = await Payment.find({
        "media.photographer": userId,
        status: "completed"
      })
        .populate("media", "title price")
        .populate("buyer", "username email")
        .sort({ createdAt: -1 });

      transactions = payments.map(p => ({
        id: p._id,
        type: "earnings",
        amount: p.photographerShare,
        description: `Earnings from ${p.buyer?.username || 'Unknown'} for ${p.media?.title}`,
        date: p.createdAt,
        status: "completed",
        reference: p._id
      }));
    } else if (user.role === "buyer") {
      // Get purchases for buyer
      const payments = await Payment.find({ 
        buyer: userId,
        status: "completed"
      })
        .populate("media", "title price")
        .sort({ createdAt: -1 });

      transactions = payments.map(p => ({
        id: p._id,
        type: "purchase",
        amount: p.amount,
        description: `Purchase: ${p.media?.title}`,
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
// Add funds to wallet (mock - in real system would integrate with payment gateway)
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

    // In a real system, you would create a payment transaction here
    res.status(200).json({
      message: "Funds added successfully",
      amount,
      newBalance: amount // Mock balance
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

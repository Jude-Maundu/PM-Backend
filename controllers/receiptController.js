import Receipt from "../models/Receipt.js";
import Payment from "../models/Payment.js";
import Media from "../models/media.js";

// ==============================
// Generate receipt number
// ==============================
function generateReceiptNumber() {
  return "RCP-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9).toUpperCase();
}

// ==============================
// Create receipt
// ==============================
export async function createReceipt(req, res) {
  try {
    const { paymentId, downloadUrl } = req.body;

    const payment = await Payment.findById(paymentId)
      .populate("buyer")
      .populate({
        path: "media",
        populate: { path: "photographer", select: "username" }
      });

    if (!payment) return res.status(404).json({ message: "Payment not found" });

    const receipt = await Receipt.create({
      buyer: payment.buyer._id,
      payment: paymentId,
      items: [
        {
          media: payment.media._id,
          title: payment.media.title,
          price: payment.amount,
          photographer: payment.media.photographer._id,
        }
      ],
      totalAmount: payment.amount,
      adminShare: payment.adminShare,
      downloadUrl,
      receiptNumber: generateReceiptNumber(),
    });

    res.status(201).json({ message: "Receipt created", receipt });
  } catch (error) {
    res.status(500).json({ message: "Error creating receipt", error: error.message });
  }
}

// ==============================
// Get receipt
// ==============================
export async function getReceipt(req, res) {
  try {
    const { receiptId } = req.params;

    const receipt = await Receipt.findById(receiptId)
      .populate("buyer", "username email")
      .populate("items.media", "title")
      .populate("items.photographer", "username");

    if (!receipt) return res.status(404).json({ message: "Receipt not found" });

    res.status(200).json(receipt);
  } catch (error) {
    res.status(500).json({ message: "Error fetching receipt", error: error.message });
  }
}

// ==============================
// Get user receipts
// ==============================
export async function getUserReceipts(req, res) {
  try {
    const { userId } = req.params;

    const receipts = await Receipt.find({ buyer: userId })
      .populate("items.media", "title")
      .populate("items.photographer", "username")
      .sort({ createdAt: -1 });

    res.status(200).json(receipts);
  } catch (error) {
    res.status(500).json({ message: "Error fetching receipts", error: error.message });
  }
}

// ==============================
// Get all receipts (Admin)
// ==============================
export async function getAllReceipts(req, res) {
  try {
    const receipts = await Receipt.find()
      .populate("buyer", "username email")
      .populate("items.media", "title")
      .populate("items.photographer", "username")
      .sort({ createdAt: -1 });

    res.status(200).json(receipts);
  } catch (error) {
    res.status(500).json({ message: "Error fetching receipts", error: error.message });
  }
}

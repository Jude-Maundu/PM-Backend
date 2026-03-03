import Refund from "../models/Refund.js";
import Payment from "../models/Payment.js";
import Media from "../models/media.js";
import User from "../models/users.js";

// ==============================
// Request refund
// ==============================
export async function requestRefund(req, res) {
  try {
    const { paymentId, reason } = req.body;

    const payment = await Payment.findById(paymentId).populate("media");
    if (!payment) return res.status(404).json({ message: "Payment not found" });

    // Check if refund already exists for this payment
    const existingRefund = await Refund.findOne({ payment: paymentId, status: { $in: ["pending", "approved"] } });
    if (existingRefund) {
      return res.status(400).json({ message: "Refund already requested for this payment" });
    }

    const refund = await Refund.create({
      payment: paymentId,
      buyer: payment.buyer,
      media: payment.media._id,
      amount: payment.amount,
      reason,
    });

    res.status(201).json({ message: "Refund requested", refund });
  } catch (error) {
    res.status(500).json({ message: "Error requesting refund", error: error.message });
  }
}

// ==============================
// Get user refunds
// ==============================
export async function getUserRefunds(req, res) {
  try {
    const { userId } = req.params;

    const refunds = await Refund.find({ buyer: userId })
      .populate("payment")
      .populate("media", "title")
      .sort({ createdAt: -1 });

    res.status(200).json(refunds);
  } catch (error) {
    res.status(500).json({ message: "Error fetching refunds", error: error.message });
  }
}

// ==============================
// Approve refund (Admin only)
// ==============================
export async function approveRefund(req, res) {
  try {
    const { refundId, refundAmount } = req.body;

    const refund = await Refund.findByIdAndUpdate(
      refundId,
      { status: "approved", refundAmount: refundAmount || refund.amount },
      { new: true }
    );

    if (!refund) return res.status(404).json({ message: "Refund not found" });

    res.status(200).json({ message: "Refund approved", refund });
  } catch (error) {
    res.status(500).json({ message: "Error approving refund", error: error.message });
  }
}

// ==============================
// Reject refund (Admin only)
// ==============================
export async function rejectRefund(req, res) {
  try {
    const { refundId, reason } = req.body;

    const refund = await Refund.findByIdAndUpdate(
      refundId,
      { status: "rejected", adminRejectionReason: reason },
      { new: true }
    );

    if (!refund) return res.status(404).json({ message: "Refund not found" });

    res.status(200).json({ message: "Refund rejected", refund });
  } catch (error) {
    res.status(500).json({ message: "Error rejecting refund", error: error.message });
  }
}

// ==============================
// Process refund (Admin processing)
// ==============================
export async function processRefund(req, res) {
  try {
    const { refundId } = req.body;

    const refund = await Refund.findById(refundId).populate("buyer").populate("payment");
    if (!refund) return res.status(404).json({ message: "Refund not found" });

    if (refund.status !== "approved") {
      return res.status(400).json({ message: "Refund is not approved" });
    }

    // Update refund status
    refund.status = "processed";
    await refund.save();

    // Update payment status
    await Payment.findByIdAndUpdate(refund.payment._id, { status: "refunded" });

    res.status(200).json({
      message: "Refund processed successfully",
      refund
    });
  } catch (error) {
    res.status(500).json({ message: "Error processing refund", error: error.message });
  }
}

// ==============================
// Get all refunds (Admin)
// ==============================
export async function getAllRefunds(req, res) {
  try {
    const refunds = await Refund.find()
      .populate("buyer", "username email")
      .populate("media", "title")
      .sort({ createdAt: -1 });

    res.status(200).json(refunds);
  } catch (error) {
    res.status(500).json({ message: "Error fetching refunds", error: error.message });
  }
}

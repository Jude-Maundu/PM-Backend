import axios from "axios";
import Media from "../models/media.js";
import Payment from "../models/Payment.js";
import User from "../models/users.js";
import Wallet from "../models/Wallet.js";

const consumerKey = process.env.MPESA_CONSUMER_KEY;
const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
const shortCode = process.env.MPESA_SHORTCODE;
const passkey = process.env.MPESA_PASSKEY;
const env = process.env.MPESA_ENVIRONMENT;
const baseUrl = process.env.BASE_URL;

// Get Daraja access token
async function getAccessToken() {
  if (!consumerKey || !consumerSecret) {
    throw new Error("MPesa credentials not configured");
  }
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
  const url = env === "sandbox" ? "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials"
                                : "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";

  const response = await axios.get(url, { headers: { Authorization: `Basic ${auth}` } });
  return response.data.access_token;
}

// Initiate STK Push
async function payWithMpesa(req, res) {
  try {
    const { mediaId, buyerPhone, buyerId } = req.body;

    // Validate required fields
    if (!mediaId || !buyerPhone || !buyerId) {
      return res.status(400).json({ 
        message: "Missing required fields: mediaId, buyerPhone, buyerId" 
      });
    }

    // Validate phone number format (should be 254XXXXXXXXX)
    const phoneRegex = /^254\d{9}$/;
    if (!phoneRegex.test(buyerPhone)) {
      return res.status(400).json({ 
        message: "Invalid phone number format. Use 254XXXXXXXXX" 
      });
    }

    // Check MPesa configuration
    if (!consumerKey || !consumerSecret || !shortCode || !passkey || !env || !baseUrl) {
      return res.status(400).json({ 
        message: "MPesa configuration incomplete. Check environment variables." 
      });
    }

    const media = await Media.findById(mediaId);
    if (!media) return res.status(404).json({ message: "Media not found" });

    if (!media.price || media.price <= 0) {
      return res.status(400).json({ message: "Media price is not set or invalid" });
    }

    const buyer = await User.findById(buyerId);
    if (!buyer) return res.status(404).json({ message: "Buyer not found" });

    const adminCut = media.price * 0.10;
    const photographerCut = media.price - adminCut;

    const accessToken = await getAccessToken();

    const timestamp = new Date().toISOString().replace(/[-T:.Z]/g,"").slice(0,14);
    const password = Buffer.from(shortCode + passkey + timestamp).toString("base64");

    const stkPushBody = {
      BusinessShortCode: shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: media.price,
      PartyA: buyerPhone, // customer
      PartyB: shortCode,  // business
      PhoneNumber: buyerPhone,
      CallBackURL: `${baseUrl}/api/payments/callback`,
      AccountReference: mediaId,
      TransactionDesc: `Payment for media: ${media.title}`,
    };

    const stkResponse = await axios.post(
      env === "sandbox"
        ? "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest"
        : "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      stkPushBody,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const payment = await Payment.create({
      buyer: buyerId,
      media: mediaId,
      amount: media.price,
      adminShare: adminCut,
      photographerShare: photographerCut,
      status: "pending",
      paymentMethod: "mpesa",
      checkoutRequestID: stkResponse.data.CheckoutRequestID
    });

    res.status(200).json({ message: "STK Push initiated", payment, stkResponse: stkResponse.data });

  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ message: "Payment initiation failed", error: error.message });
  }
}

// Daraja Callback URL
async function mpesaCallback(req, res) {
  try {
    const callbackData = req.body;
    const checkoutRequestID = callbackData.Body.stkCallback.CheckoutRequestID;
    const resultCode = callbackData.Body.stkCallback.ResultCode;

    const payment = await Payment.findOne({ checkoutRequestID }).populate("buyer").populate("media");
    if (!payment) return res.status(404).send("Payment not found");

    if (resultCode === 0) {
      payment.status = "completed";
      
      // Credit photographer wallet
      const photographer = payment.media.photographer;
      let photographerWallet = await Wallet.findOne({ user: photographer });
      if (!photographerWallet) {
        photographerWallet = await Wallet.create({ user: photographer });
      }
      photographerWallet.balance += payment.photographerShare;
      photographerWallet.totalEarnings += payment.photographerShare;
      await photographerWallet.save();
      
      // Credit admin wallet (find admin user)
      const admin = await User.findOne({ role: "admin" });
      if (admin) {
        let adminWallet = await Wallet.findOne({ user: admin._id });
        if (!adminWallet) {
          adminWallet = await Wallet.create({ user: admin._id });
        }
        adminWallet.balance += payment.adminShare;
        adminWallet.totalEarnings += payment.adminShare;
        await adminWallet.save();
      }
    } else {
      payment.status = "failed";
    }

    await payment.save();
    res.status(200).send("Callback received");

  } catch (error) {
    console.error(error);
    res.status(500).send("Callback error");
  }
}

// ==============================
// Get photographer earnings
// ==============================
async function getPhotographerEarnings(req, res) {
  try {
    const { photographerId } = req.params;
    
    // Get photographer's wallet
    const wallet = await Wallet.findOne({ user: photographerId });
    if (!wallet) {
      return res.status(404).json({ message: "Wallet not found" });
    }
    
    // Get all sales of this photographer's media
    const sales = await Payment.find({ 
      media: { $in: await Media.find({ photographer: photographerId }).select("_id") },
      status: "completed"
    })
    .populate("media", "title price")
    .populate("buyer", "username email")
    .sort({ createdAt: -1 });
    
    res.status(200).json({
      wallet,
      sales,
      totalSales: sales.length
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching earnings", error: error.message });
  }
}

// ==============================
// Get admin dashboard (all payments)
// ==============================
async function getAdminDashboard(req, res) {
  try {
    const allPayments = await Payment.find({ status: "completed" })
      .populate("buyer", "username email")
      .populate("media", "title price photographer")
      .populate("media.photographer", "username email")
      .sort({ createdAt: -1 });
    
    const adminWallet = await Wallet.findOne({ user: req.body.adminId });
    
    const totalRevenue = allPayments.reduce((sum, p) => sum + p.adminShare, 0);
    
    res.status(200).json({
      adminWallet,
      allPayments,
      totalRevenue,
      totalSales: allPayments.length
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching admin dashboard", error: error.message });
  }
}

export { payWithMpesa, mpesaCallback, getUserWallet, getUserTransactions, buyMedia, getPhotographerEarnings, getAdminDashboard, getPhotographerEarningsSummary, getPurchaseHistory };

// ==============================
// Get photographer earnings summary
// ==============================
async function getPhotographerEarningsSummary(req, res) {
  try {
    const { photographerId } = req.params;

    const wallet = await Wallet.findOne({ user: photographerId });
    if (!wallet) {
      return res.status(404).json({ message: "Wallet not found" });
    }

    // Get all media by photographer
    const mediaItems = await Media.find({ photographer: photographerId });
    const mediaIds = mediaItems.map((m) => m._id);

    // Get all completed sales
    const sales = await Payment.find({
      media: { $in: mediaIds },
      status: "completed",
    })
      .populate("media", "title price")
      .populate("buyer", "username email")
      .sort({ createdAt: -1 });

    // Calculate summary
    const totalEarned = sales.reduce((sum, s) => sum + s.photographerShare, 0);
    const soldCount = sales.length;
    const topSellingMedia = mediaItems.sort((a, b) => {
      const aCount = sales.filter((s) => s.media._id.toString() === a._id.toString()).length;
      const bCount = sales.filter((s) => s.media._id.toString() === b._id.toString()).length;
      return bCount - aCount;
    })[0];

    res.status(200).json({
      wallet,
      earnings: {
        totalEarned,
        currentBalance: wallet.balance,
        totalWithdrawn: wallet.totalWithdrawn,
      },
      sales: {
        totalSales: soldCount,
        averagePrice: soldCount > 0 ? totalEarned / soldCount : 0,
        topSellingPhoto: topSellingMedia,
      },
      recentSales: sales.slice(0, 10),
    });
  } catch (error) {
    res.status(500).json({
      message: "Error fetching earnings summary",
      error: error.message,
    });
  }
}

// ==============================
// Get user purchase history with receipts
// ==============================
async function getPurchaseHistory(req, res) {
  try {
    const { userId } = req.params;

    const payments = await Payment.find({ buyer: userId, status: "completed" })
      .populate("media", "title price photographer fileUrl")
      .populate("media.photographer", "username")
      .sort({ createdAt: -1 });

    const purchaseHistory = payments.map((payment) => ({
      paymentId: payment._id,
      amount: payment.amount,
      media: payment.media,
      date: payment.createdAt,
      downloadUrl: generateSignedUrl(payment.media.fileUrl),
      status: payment.status,
    }));

    res.status(200).json(purchaseHistory);
  } catch (error) {
    res.status(500).json({
      message: "Error fetching purchase history",
      error: error.message,
    });
  }
}

// ==============================
// Generate secure signed URL for download
// ==============================
function generateSignedUrl(fileUrl, expiresIn = 3600) {
  // Append timestamp and expiration to URL
  const expiryTime = Date.now() + expiresIn * 1000;
  const token = Buffer.from(fileUrl + expiryTime).toString("base64");
  return `${fileUrl}?token=${token}&expires=${expiryTime}`;
}

// ==============================
// Get user wallet
// ==============================
async function getUserWallet(req, res) {
  try {
    const { userId } = req.params;
    let wallet = await Wallet.findOne({ user: userId }).populate("user", "username email");
    
    if (!wallet) {
      wallet = await Wallet.create({ user: userId });
      await wallet.populate("user", "username email");
    }
    
    res.status(200).json(wallet);
  } catch (error) {
    res.status(500).json({ message: "Error fetching wallet", error: error.message });
  }
}

// ==============================
// Get user transactions/purchases
// ==============================
async function getUserTransactions(req, res) {
  try {
    const { userId } = req.params;
    const transactions = await Payment.find({ buyer: userId })
      .populate("media", "title price")
      .populate("buyer", "username email")
      .sort({ createdAt: -1 });
    
    res.status(200).json(transactions);
  } catch (error) {
    res.status(500).json({ message: "Error fetching transactions", error: error.message });
  }
}

// ==============================
// Buy media directly (mock payment for testing)
// ==============================
async function buyMedia(req, res) {
  try {
    const { mediaId, buyerId } = req.body;
    
    const media = await Media.findById(mediaId);
    if (!media) return res.status(404).json({ message: "Media not found" });
    
    const buyer = await User.findById(buyerId);
    if (!buyer) return res.status(404).json({ message: "Buyer not found" });
    
    const adminCut = media.price * 0.10;
    const photographerCut = media.price - adminCut;
    
    // Create payment record
    const payment = await Payment.create({
      buyer: buyerId,
      media: mediaId,
      amount: media.price,
      adminShare: adminCut,
      photographerShare: photographerCut,
      status: "completed",
      paymentMethod: "mock"
    });
    
    // Credit photographer wallet
    const photographer = media.photographer;
    let photographerWallet = await Wallet.findOne({ user: photographer });
    if (!photographerWallet) {
      photographerWallet = await Wallet.create({ user: photographer });
    }
    photographerWallet.balance += photographerCut;
    photographerWallet.totalEarnings += photographerCut;
    await photographerWallet.save();
    
    // Credit admin wallet
    const admin = await User.findOne({ role: "admin" });
    if (admin) {
      let adminWallet = await Wallet.findOne({ user: admin._id });
      if (!adminWallet) {
        adminWallet = await Wallet.create({ user: admin._id });
      }
      adminWallet.balance += adminCut;
      adminWallet.totalEarnings += adminCut;
      await adminWallet.save();
    }
    
    res.status(201).json({ 
      message: "Payment successful", 
      payment,
      photographerEarned: photographerCut,
      adminEarned: adminCut
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Payment failed", error: error.message });
  }
}

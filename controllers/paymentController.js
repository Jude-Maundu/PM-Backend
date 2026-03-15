import axios from "axios";
import Media from "../models/media.js";
import Payment from "../models/Payment.js";
import User from "../models/users.js";
import Wallet from "../models/Wallet.js";

const consumerKey = process.env.MPESA_CONSUMER_KEY;
const consumerSecret = process.env.MPESA_SECRET_KEY;
const shortCode = process.env.MPESA_SHORTCODE || "174379";
const passkey = process.env.MPESA_PASSKEY;
const env = process.env.MPESA_ENVIRONMENT || "sandbox";
const baseUrl = process.env.BASE_URL || "https://pm-backend-1-0s8f.onrender.com";
const initiatorName = process.env.MPESA_INITIATOR_NAME || "testapi";
const initiatorPassword = process.env.MPESA_INITIATOR_PASSWORD || "";
const adminPhoneNumber = process.env.ADMIN_PHONE_NUMBER || "254793945789";

// Get Daraja access token
async function getAccessToken() {
  try {
    if (!consumerKey || !consumerSecret) {
      throw new Error("MPesa credentials not configured");
    }
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
    const url = env === "sandbox"
      ? "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials"
      : "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";

    const response = await axios.get(url, {
      headers: { Authorization: `Basic ${auth}` },
      timeout: 10000
    });
    return response.data.access_token;
  } catch (error) {
    console.error("❌ Error getting access token:", error.response?.data || error.message);
    throw error;
  }
}

// Send money to photographer via B2C (Business to Customer)
async function sendMoneyToPhotographer(phoneNumber, amount, reference, description) {
  try {
    if (!phoneNumber) {
      console.warn("⚠️ Photographer phone number not set, skipping B2C payment");
      return { success: false, message: "Photographer phone number not configured" };
    }

    const accessToken = await getAccessToken();
    const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);

    const b2cPayload = {
      InitiatorName: initiatorName,
      SecurityCredential: initiatorPassword,
      CommandID: "SalaryPayment", // or "BusinessPayment", "PromotionPayment"
      Amount: Math.round(amount),
      PartyA: shortCode,
      PartyB: phoneNumber,
      Remarks: description,
      QueueTimeOutURL: `${baseUrl}/b2c-timeout`,
      ResultURL: `${baseUrl}/b2c-callback`,
      Occasion: reference
    };

    console.log("💸 Sending B2C payment to photographer:", {
      phone: phoneNumber,
      amount: Math.round(amount),
      reference
    });

    const b2cResponse = await axios.post(
      env === "sandbox"
        ? "https://sandbox.safaricom.co.ke/mpesa/b2c/v1/paymentrequest"
        : "https://api.safaricom.co.ke/mpesa/b2c/v1/paymentrequest",
      b2cPayload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        timeout: 30000
      }
    );

    console.log("✅ B2C Payment initiated:", b2cResponse.data);
    return { success: true, data: b2cResponse.data };
  } catch (error) {
    console.error("❌ B2C Payment error:", error.response?.data || error.message);
    return { success: false, error: error.response?.data || error.message };
  }
}

// Initiate STK Push
async function payWithMpesa(req, res) {
  try {
    const { mediaId, buyerPhone, buyerId, amount, walletTopup } = req.body;
    const topup = walletTopup === true || walletTopup === "true";

    // Validate required fields
    if (!buyerPhone || !buyerId || (!topup && !mediaId)) {
      return res.status(400).json({
        message: "Missing required fields: buyerPhone, buyerId, and mediaId for purchase or walletTopup flag"
      });
    }

    if (topup && (!amount || amount <= 0)) {
      return res.status(400).json({ message: "Amount must be greater than 0 for wallet topup" });
    }

    // Validate phone number format (should be 254XXXXXXXXX)
    const phoneRegex = /^254\d{9}$/;
    if (!phoneRegex.test(buyerPhone)) {
      return res.status(400).json({
        message: "Invalid phone number format. Use 254XXXXXXXXX (e.g., 254712345678)"
      });
    }

    // Check MPesa configuration
    if (!consumerKey || !consumerSecret || !shortCode || !passkey) {
      return res.status(400).json({
        message: "MPesa configuration incomplete. Check environment variables.",
        missing: {
          consumerKey: !consumerKey,
          consumerSecret: !consumerSecret,
          shortCode: !shortCode,
          passkey: !passkey
        }
      });
    }

    const buyer = await User.findById(buyerId);
    if (!buyer) return res.status(404).json({ message: "Buyer not found" });

    let media = null;
    let paymentAmount = 0;
    let adminCut = 0;
    let photographerCut = 0;
    let accountReference = "WALLET_TOPUP";
    let transactionDesc = "Wallet topup";

    if (topup) {
      paymentAmount = Number(amount);
    } else {
      media = await Media.findById(mediaId);
      if (!media) return res.status(404).json({ message: "Media not found" });

      if (!media.price || media.price <= 0) {
        return res.status(400).json({ message: "Media price is not set or invalid" });
      }

      paymentAmount = media.price;
      adminCut = Math.round(media.price * 0.10 * 100) / 100; // 10% platform fee
      photographerCut = Math.round((media.price - adminCut) * 100) / 100;
      accountReference = mediaId.substring(0, 12);
      transactionDesc = `Payment for: ${media.title.substring(0, 12)}`;
    }

    const accessToken = await getAccessToken();

    // Generate timestamp in format YYYYMMDDHHmmss
    const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);
    const password = Buffer.from(shortCode + passkey + timestamp).toString("base64");

    const stkPushBody = {
      BusinessShortCode: shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.round(paymentAmount),
      PartyA: buyerPhone,
      PartyB: shortCode,
      PhoneNumber: buyerPhone,
      CallBackURL: `${baseUrl}/api/payments/callback`,
      AccountReference: accountReference,
      TransactionDesc: transactionDesc
    };

    console.log("📤 Sending STK Push:", stkPushBody);

    const stkResponse = await axios.post(
      env === "sandbox"
        ? "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest"
        : "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      stkPushBody,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        timeout: 30000
      }
    );

    console.log("✅ STK Push Response:", stkResponse.data);

    const payment = await Payment.create({
      buyer: buyerId,
      media: topup ? null : mediaId,
      amount: paymentAmount,
      adminShare: adminCut,
      photographerShare: photographerCut,
      status: "pending",
      paymentMethod: "mpesa",
      checkoutRequestID: stkResponse.data.CheckoutRequestID,
      merchantRequestID: stkResponse.data.MerchantRequestID,
      phoneNumber: buyerPhone
    });

    res.status(200).json({
      success: true,
      message: "STK Push initiated. Please check your phone to complete payment.",
      payment,
      stkResponse: stkResponse.data
    });
  } catch (error) {
    console.error("❌ Payment initiation error:", error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: "Payment initiation failed",
      error: error.response?.data || error.message
    });
  }
}

// M-Pesa Callback URL
async function mpesaCallback(req, res) {
  try {
    const callbackData = req.body;
    console.log("========== MPESA CALLBACK RECEIVED ==========");
    console.log(JSON.stringify(callbackData, null, 2));
    console.log("=============================================");

    if (!callbackData.Body || !callbackData.Body.stkCallback) {
      return res.status(400).json({ ResultCode: 1, ResultDesc: "Invalid callback data" });
    }

    const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = callbackData.Body.stkCallback;

    const payment = await Payment.findOne({ checkoutRequestID: CheckoutRequestID })
      .populate("buyer")
      .populate({
        path: "media",
        populate: { path: "photographer" }
      });

    if (!payment) {
      console.error("❌ Payment not found for CheckoutRequestID:", CheckoutRequestID);
      return res.status(404).json({ ResultCode: 1, ResultDesc: "Payment not found" });
    }

    console.log(`💰 Payment found: ${payment._id}, Current status: ${payment.status}`);

    if (ResultCode === 0) {
      // Payment successful - extract M-Pesa receipt number from metadata
      let mpesaReceiptNumber = "";
      if (CallbackMetadata && CallbackMetadata.Item) {
        const receiptItem = CallbackMetadata.Item.find(item => item.Name === "MpesaReceiptNumber");
        if (receiptItem) {
          mpesaReceiptNumber = receiptItem.Value;
        }
      }

      payment.status = "completed";
      payment.mpesaReceiptNumber = mpesaReceiptNumber;
      payment.transactionDate = new Date();

      if (payment.media) {
        // Increment media downloads
        await Media.findByIdAndUpdate(payment.media._id, {
          $inc: { downloads: 1 }
        });

        console.log(`✅ Media payment completed. Receipt: ${mpesaReceiptNumber}`);

        // Send money to photographer
        if (payment.media.photographer && payment.photographerShare > 0) {
          const photographerPhoneNumber = payment.media.photographer.phoneNumber;
          const photographerName = payment.media.photographer.username;

          if (photographerPhoneNumber) {
            console.log(`📱 Sending ${payment.photographerShare} KES to photographer ${photographerName}`);
            const b2cResult = await sendMoneyToPhotographer(
              photographerPhoneNumber,
              payment.photographerShare,
              payment._id.toString(),
              `Payment for: ${payment.media.title}`
            );

            if (b2cResult.success) {
              console.log(`✅ B2C payment sent to photographer`);
            } else {
              console.warn(`⚠️ Failed to send B2C payment to photographer: ${b2cResult.error}`);
            }
          } else {
            console.warn(`⚠️ Photographer ${photographerName} has no phone number set`);
          }
        }

        // Send money to admin
        if (payment.adminShare > 0 && adminPhoneNumber) {
          console.log(`💼 Sending ${payment.adminShare} KES to admin account`);
          const adminB2cResult = await sendMoneyToPhotographer(
            adminPhoneNumber,
            payment.adminShare,
            `ADMIN-${payment._id.toString()}`,
            `Admin commission: ${payment.media.title}`
          );

          if (adminB2cResult.success) {
            console.log(`✅ B2C admin payment sent to ${adminPhoneNumber}`);
          } else {
            console.warn(`⚠️ Failed to send B2C admin payment: ${adminB2cResult.error}`);
          }
        }
      } else {
        // Wallet topup
        let wallet = await Wallet.findOne({ user: payment.buyer._id || payment.buyer });
        if (!wallet) {
          wallet = await Wallet.create({ user: payment.buyer._id || payment.buyer, balance: 0 });
        }
        wallet.balance += payment.amount;
        await wallet.save();

        console.log(`✅ Wallet topup completed: +KES ${payment.amount} for user ${payment.buyer._id || payment.buyer}`);
      }
    } else {
      // Payment failed
      payment.status = "failed";
      console.log(`❌ Payment failed: ${ResultDesc}`);
    }

    payment.callbackData = callbackData;
    await payment.save();

    // M-Pesa expects this exact response
    res.status(200).json({
      ResultCode: 0,
      ResultDesc: "Success"
    });

  } catch (error) {
    console.error("❌ Callback error:", error);
    res.status(500).json({
      ResultCode: 1,
      ResultDesc: "Internal server error"
    });
  }
}

// Mock payment for testing (no M-Pesa)
async function buyMedia(req, res) {
  try {
    const { mediaId, buyerId, useWallet = true } = req.body;

    if (!mediaId || !buyerId) {
      return res.status(400).json({ message: "mediaId and buyerId are required" });
    }

    const media = await Media.findById(mediaId).populate("photographer");
    if (!media) return res.status(404).json({ message: "Media not found" });

    const buyer = await User.findById(buyerId);
    if (!buyer) return res.status(404).json({ message: "Buyer not found" });

    // Wallet deduction path
    if (useWallet) {
      const wallet = await Wallet.findOne({ user: buyerId });
      if (!wallet || wallet.balance < media.price) {
        return res.status(400).json({ message: "Insufficient wallet balance" });
      }
      wallet.balance -= media.price;
      await wallet.save();
    }

    const adminCut = Math.round(media.price * 0.10 * 100) / 100;
    const photographerCut = Math.round((media.price - adminCut) * 100) / 100;

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

    // Increment downloads
    await Media.findByIdAndUpdate(mediaId, { $inc: { downloads: 1 } });

    // Send money to photographer
    if (media.photographer && photographerCut > 0) {
      const photographerPhoneNumber = media.photographer.phoneNumber;
      const photographerName = media.photographer.username;

      if (photographerPhoneNumber) {
        console.log(`📱 [MOCK] Sending ${photographerCut} KES to photographer ${photographerName}`);
        const b2cResult = await sendMoneyToPhotographer(
          photographerPhoneNumber,
          photographerCut,
          payment._id.toString(),
          `Payment for: ${media.title}`
        );

        if (b2cResult.success) {
          console.log(`✅ [MOCK] B2C payment sent to photographer`);
        } else {
          console.warn(`⚠️ [MOCK] Failed to send B2C payment to photographer: ${b2cResult.error}`);
        }
      } else {
        console.warn(`⚠️ [MOCK] Photographer ${photographerName} has no phone number set`);
      }
    }

    // Send money to admin
    if (adminCut > 0 && adminPhoneNumber) {
      console.log(`💼 [MOCK] Sending ${adminCut} KES to admin account`);
      const adminB2cResult = await sendMoneyToPhotographer(
        adminPhoneNumber,
        adminCut,
        `ADMIN-${payment._id.toString()}`,
        `Admin commission: ${media.title}`
      );

      if (adminB2cResult.success) {
        console.log(`✅ [MOCK] B2C admin payment sent to ${adminPhoneNumber}`);
      } else {
        console.warn(`⚠️ [MOCK] Failed to send B2C admin payment: ${adminB2cResult.error}`);
      }
    }

    res.status(201).json({
      success: true,
      message: "Purchase successful (mock)",
      payment,
      photographerEarned: photographerCut,
      adminEarned: adminCut
    });
  } catch (error) {
    console.error("❌ Mock payment error:", error);
    res.status(500).json({ message: "Payment failed", error: error.message });
  }
}

// Get photographer earnings
async function getPhotographerEarnings(req, res) {
  try {
    const { photographerId } = req.params;
    
    const mediaItems = await Media.find({ photographer: photographerId }).select("_id");
    const mediaIds = mediaItems.map(m => m._id);
    
    const sales = await Payment.find({ 
      media: { $in: mediaIds },
      status: "completed"
    })
    .populate("media", "title price")
    .populate("buyer", "username email")
    .sort({ createdAt: -1 });
    
    const totalEarned = sales.reduce((sum, s) => sum + s.photographerShare, 0);
    
    res.status(200).json({
      sales,
      totalSales: sales.length,
      totalEarned
    });
  } catch (error) {
    console.error("Error fetching earnings:", error);
    res.status(500).json({ message: "Error fetching earnings", error: error.message });
  }
}

// Get photographer earnings summary
async function getPhotographerEarningsSummary(req, res) {
  try {
    const { photographerId } = req.params;

    // Support the special modifier "all" for admin dashboards.
    // When "all" is used, return earnings across all photographers.
    const isAll = photographerId === "all";

    let mediaItems = [];
    if (!isAll) {
      // Validate the photographerId to avoid casting errors
      if (!photographerId || photographerId === "undefined" || photographerId === "null") {
        return res.status(400).json({ message: "Invalid photographerId" });
      }

      mediaItems = await Media.find({ photographer: photographerId });
    }

    const mediaIds = mediaItems.map((m) => m._id);

    const paymentsQuery = {
      status: "completed",
    };

    if (!isAll) {
      paymentsQuery.media = { $in: mediaIds };
    }

    const sales = await Payment.find(paymentsQuery)
      .populate("media", "title price")
      .populate("buyer", "username email")
      .sort({ createdAt: -1 });

    const totalEarned = sales.reduce((sum, s) => sum + s.photographerShare, 0);
    const soldCount = sales.length;
    const averagePrice = soldCount > 0 ? Math.round(totalEarned / soldCount) : 0;

    // Find top selling media
    let topSellingMedia = null;
    const salesCount = {};

    sales.forEach((s) => {
      if (s.media && s.media._id) {
        const mediaId = s.media._id.toString();
        salesCount[mediaId] = (salesCount[mediaId] || 0) + 1;
      }
    });

    if (Object.keys(salesCount).length > 0) {
      const topMediaId = Object.keys(salesCount).sort((a, b) => salesCount[b] - salesCount[a])[0];
      topSellingMedia = sales.find((s) => s.media?._id?.toString() === topMediaId)?.media || null;
    }

    res.status(200).json({
      earnings: {
        totalEarned,
        currentBalance: totalEarned, // In a real system, you'd subtract withdrawals
      },
      sales: {
        totalSales: soldCount,
        averagePrice,
        topSellingPhoto: topSellingMedia,
      },
      recentSales: sales.slice(0, 10),
    });
  } catch (error) {
    console.error("Error fetching earnings summary:", error);
    res.status(500).json({
      message: "Error fetching earnings summary",
      error: error.message,
    });
  }
}

// Get user purchase history
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
      receiptId: payment.receiptId || payment._id,
      status: payment.status,
    }));

    res.status(200).json(purchaseHistory);
  } catch (error) {
    console.error("Error fetching purchase history:", error);
    res.status(500).json({
      message: "Error fetching purchase history",
      error: error.message,
    });
  }
}

// Get admin dashboard
async function getAdminDashboard(req, res) {
  try {
    const allPayments = await Payment.find({ status: "completed" })
      .populate("buyer", "username email")
      .populate("media", "title price photographer")
      .populate({
        path: 'media',
        populate: { path: 'photographer', select: 'username email' }
      })
      .sort({ createdAt: -1 });
    
    const totalRevenue = allPayments.reduce((sum, p) => sum + (p.adminShare || 0), 0);
    const totalSales = allPayments.length;
    const totalPhotographerEarnings = allPayments.reduce((sum, p) => sum + (p.photographerShare || 0), 0);
    
    res.status(200).json({
      allPayments,
      totalRevenue,
      totalSales,
      totalPhotographerEarnings
    });
  } catch (error) {
    console.error("Error fetching admin dashboard:", error);
    res.status(500).json({ message: "Error fetching admin dashboard", error: error.message });
  }
}

export { 
  payWithMpesa, 
  mpesaCallback, 
  buyMedia, 
  getPhotographerEarnings, 
  getAdminDashboard, 
  getPhotographerEarningsSummary, 
  getPurchaseHistory 
};
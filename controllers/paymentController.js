import mongoose from "mongoose";
import axios from "axios";
import Media from "../models/media.js";
import Payment from "../models/Payment.js";
import Receipt from "../models/Receipt.js";
import MpesaLog from "../models/MpesaLog.js";
import MpesaRetry from "../models/MpesaRetry.js";
import User from "../models/users.js";
import Album from "../models/album.js";
import Refund from "../models/Refund.js";
import Wallet from "../models/Wallet.js";
import emailService from "../services/emailService.js";

const consumerKey = process.env.MPESA_CONSUMER_KEY;
const consumerSecret = process.env.MPESA_SECRET_KEY;
const shortCode = process.env.MPESA_BUSINESS_SHORTCODE || process.env.MPESA_SHORTCODE || "174379";
const passkey = process.env.MPESA_PASSKEY;
const env = process.env.MPESA_ENV || process.env.MPESA_ENVIRONMENT || "sandbox";

const defaultBaseUrl = process.env.BASE_URL || "https://pm-backend-f3b6.onrender.com";

const initiatorName = process.env.MPESA_INITIATOR_NAME || "testapi";
const securityCredential = process.env.MPESA_SECURITY_CREDENTIAL || "";
const initiatorPassword = process.env.MPESA_INITIATOR_PASSWORD || "";
const adminPhoneNumber = process.env.ADMIN_PHONE_NUMBER || "254793945789";

function getBaseUrl(req) {
  if (!req) return defaultBaseUrl;
  if (process.env.BASE_URL) return process.env.BASE_URL;
  const host = req.get("host");
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  return `${protocol}://${host}`;
}

async function logMpesaEvent(payload) {
  try {
    await MpesaLog.create(payload);
  } catch (err) {
    console.error("❌ mpesa log save error:", err);
  }
}

async function queueB2cRetry({ payment, type, phoneNumber, amount, reference, description, error }) {
  try {
    const retry = await MpesaRetry.create({
      payment: payment?._id || payment,
      type,
      phoneNumber,
      amount,
      reference,
      description,
      attemptCount: 0,
      nextAttemptAt: new Date(Date.now() + 1000 * 60 * 1),
      status: "pending",
      lastError: error,
    });
    await logMpesaEvent({
      eventType: "error",
      source: "mpesaCallback",
      payment: payment?._id || payment,
      transactionId: reference,
      phoneNumber,
      amount,
      data: { message: "Queued B2C retry", retryId: retry._id },
      error,
    });
    return retry;
  } catch (err) {
    console.error("❌ queueB2cRetry failed", err);
    return null;
  }
}

async function processPendingB2cRetries(req) {
  try {
    const pendingRetries = await MpesaRetry.find({ status: "pending", nextAttemptAt: { $lte: new Date() }, attemptCount: { $lt: 5 } });
    for (const retry of pendingRetries) {
      retry.status = "processing";
      await retry.save();

      const accessToken = await getAccessToken();
      const baseUrl = getBaseUrl(req);
      const b2cPayload = {
        InitiatorName: initiatorName,
        SecurityCredential: initiatorPassword,
        CommandID: "SalaryPayment",
        Amount: Math.round(retry.amount),
        PartyA: shortCode,
        PartyB: retry.phoneNumber,
        Remarks: retry.description || "Retry payment",
        QueueTimeOutURL: `${baseUrl}/b2c-timeout`,
        ResultURL: `${baseUrl}/b2c-callback`,
        Occasion: retry.reference,
      };

      try {
        const b2cResponse = await axios.post(
          env === "sandbox"
            ? "https://sandbox.safaricom.co.ke/mpesa/b2c/v1/paymentrequest"
            : "https://api.safaricom.co.ke/mpesa/b2c/v1/paymentrequest",
          b2cPayload,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            timeout: 30000,
          }
        );

        retry.status = "success";
        retry.attemptCount += 1;
        await retry.save();

        await logMpesaEvent({
          eventType: "b2c",
          source: "retryWorker",
          payment: retry.payment,
          transactionId: retry.reference,
          merchantRequestID: b2cResponse.data.MerchantRequestID,
          checkoutRequestID: b2cResponse.data.CheckoutRequestID,
          phoneNumber: retry.phoneNumber,
          amount: retry.amount,
          data: b2cResponse.data,
        });
      } catch (b2cErr) {
        retry.attemptCount += 1;
        retry.status = retry.attemptCount >= retry.maxAttempts ? "failed" : "pending";
        retry.nextAttemptAt = new Date(Date.now() + 1000 * 60 * 2);
        retry.lastError = b2cErr.response?.data || b2cErr.message || b2cErr;
        await retry.save();

        await logMpesaEvent({
          eventType: "error",
          source: "retryWorker",
          payment: retry.payment,
          transactionId: retry.reference,
          phoneNumber: retry.phoneNumber,
          amount: retry.amount,
          error: b2cErr.response?.data || b2cErr.message || b2cErr,
        });
      }
    }
  } catch (err) {
    console.error("❌ processPendingB2cRetries error", err);
  }
}

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

async function sendMoneyToPhotographer(req, phoneNumber, amount, reference, description, payment = null) {
  try {
    if (!phoneNumber) {
      console.warn("⚠️ Photographer phone number not set, skipping B2C payment");
      return { success: false, message: "Photographer phone number not configured" };
    }
    if (!securityCredential || securityCredential.length < 20) {
      console.warn("⚠️ MPESA_SECURITY_CREDENTIAL is not set or looks unencrypted. B2C payout will fail.");
    }
    if (amount <= 0) {
      console.warn(`⚠️ B2C payout amount is zero or negative (${amount}), skipping payout.`);
      return { success: false, message: "B2C payout amount must be greater than zero" };
    }

    const accessToken = await getAccessToken();
    const baseUrl = getBaseUrl(req);

    const b2cPayload = {
      InitiatorName: initiatorName,
      SecurityCredential: securityCredential,
      CommandID: "SalaryPayment",
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
    await logMpesaEvent({
      eventType: "b2c",
      source: "sendMoneyToPhotographer",
      phoneNumber,
      amount,
      payment: payment?._id,
      data: b2cResponse.data
    });
    return { success: true, data: b2cResponse.data };
  } catch (error) {
    const errObj = error.response?.data || error.message;
    console.error("❌ B2C Payment error:", errObj);
    await logMpesaEvent({
      eventType: "error",
      source: "sendMoneyToPhotographer",
      phoneNumber,
      amount,
      payment: payment?._id,
      error: errObj
    });
    return { success: false, error: errObj };
  }
}

async function payWithMpesa(req, res) {
  console.log("[payWithMpesa] called", { method: req.method, path: req.originalUrl, body: req.body });
  try {
    const { buyerPhone, mediaId, cart, amount, walletTopup } = req.body;
    const buyerId = req.body.buyerId || req.body.userId;

    if (!buyerPhone || !buyerId) {
      return res.status(400).json({ success: false, message: "buyerPhone and buyerId (or userId) are required" });
    }

    const normalizedPhone = String(buyerPhone || "").replace(/[^0-9]/g, "").replace(/^0/, "254");
    if (!/^254\d{9}$/.test(normalizedPhone)) {
      return res.status(400).json({ success: false, message: "Invalid buyerPhone format. Use 254XXXXXXXXX" });
    }

    const buyer = await User.findById(buyerId);
    if (!buyer) {
      return res.status(404).json({ success: false, message: "Buyer not found" });
    }

    let paymentAmount = 0;
    let media = null;
    const cartMediaIds = [];
    let adminShare = 0;
    let photographerShare = 0;

    if (walletTopup) {
      if (!amount || Number(amount) <= 0) {
        return res.status(400).json({ success: false, message: "Amount must be > 0 for wallet topup" });
      }
      paymentAmount = Number(amount);
    } else if (mediaId) {
      media = await Media.findById(mediaId).populate("photographer");
      if (!media) {
        return res.status(404).json({ success: false, message: "Media not found" });
      }
      if (!media.price || Number(media.price) <= 0) {
        return res.status(400).json({ success: false, message: "Media price must be greater than zero" });
      }
      paymentAmount = Number(media.price);
      cartMediaIds.push(media._id);
    } else if (Array.isArray(cart) && cart.length > 0) {
      const ids = cart
        .map((item) => item.mediaId || item._id || (item.media && (item.media._id || item.media)))
        .filter(Boolean);
      if (ids.length === 0) {
        return res.status(400).json({ success: false, message: "Cart must contain at least one media item" });
      }

      const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(String(id)));
      if (validIds.length === 0) {
        return res.status(400).json({ success: false, message: "Cart contains invalid item IDs" });
      }

      const mediaRecords = await Media.find({ _id: { $in: validIds } }).populate("photographer");
      if (mediaRecords.length !== validIds.length) {
        return res.status(404).json({ success: false, message: "Some media items were not found" });
      }

      const resolvedMediaIds = mediaRecords.map((m) => m._id);
      cartMediaIds.push(...resolvedMediaIds);
      paymentAmount = Number(amount || mediaRecords.reduce((sum, item) => sum + Number(item.price || 0), 0));

      if (paymentAmount <= 0) {
        return res.status(400).json({ success: false, message: "Total amount must be greater than zero" });
      }
    } else {
      return res.status(400).json({ success: false, message: "mediaId or cart or walletTopup is required" });
    }

    if (!walletTopup) {
      adminShare = Number((paymentAmount * 0.10).toFixed(2));
      photographerShare = Number((paymentAmount - adminShare).toFixed(2));
    }

    const tempCheckoutId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const payment = await Payment.create({
      buyer: buyer._id,
      media: media?._id || null,
      cartItems: cartMediaIds.length > 0 ? cartMediaIds : undefined,
      amount: paymentAmount,
      adminShare,
      photographerShare,
      status: "pending",
      paymentMethod: "mpesa",
      checkoutRequestID: tempCheckoutId,
      merchantRequestID: tempCheckoutId,
      transactionId: tempCheckoutId,
      phoneNumber: normalizedPhone,
      transactionDate: new Date(),
      walletTopup: !!walletTopup
    });

    const accessToken = await getAccessToken();
    if (!accessToken) {
      payment.status = "failed";
      await payment.save();
      return res.status(500).json({ success: false, message: "Failed to get M-Pesa access token" });
    }

    const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);
    const password = Buffer.from(shortCode + passkey + timestamp).toString("base64");

    const baseUrl = getBaseUrl(req);
    const callbackUrl = process.env.MPESA_CALLBACK_URL || `${baseUrl}/api/payments/callback`;

    const stkPushBody = {
      BusinessShortCode: shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.round(paymentAmount),
      PartyA: normalizedPhone,
      PartyB: shortCode,
      PhoneNumber: normalizedPhone,
      CallBackURL: callbackUrl,
      AccountReference: walletTopup ? "WALLET_TOPUP" : (media ? media.title?.substring(0, 12) || "MEDIA" : "CART_CHECKOUT"),
      TransactionDesc: walletTopup ? "Wallet Topup" : (media ? `Purchase: ${media.title?.substring(0, 12)}` : "Cart Purchase")
    };

    console.log("📤 Sending STK Push:", stkPushBody);
    console.log("📤 Callback URL:", callbackUrl);

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

    payment.checkoutRequestID = stkResponse.data.CheckoutRequestID;
    payment.merchantRequestID = stkResponse.data.MerchantRequestID;
    await payment.save();

    console.log(`✅ Payment record updated with real CheckoutRequestID: ${stkResponse.data.CheckoutRequestID}`);

    return res.status(201).json({
      success: true,
      message: "STK Push sent. Please check your phone to complete payment.",
      payment: payment.toObject(),
      checkoutRequestID: stkResponse.data.CheckoutRequestID
    });

  } catch (error) {
    console.error("❌ payWithMpesa error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to initiate M-Pesa payment", 
      error: error.response?.data || error.message 
    });
  }
}

async function mpesaCallback(req, res) {
  try {
    const callbackData = req.body;
    console.log("========== MPESA CALLBACK RECEIVED ==========");
    console.log(JSON.stringify(callbackData, null, 2));
    console.log("=============================================");

    const stkCallback = callbackData?.Body?.stkCallback;
    if (!stkCallback) {
      return res.status(400).json({ ResultCode: 1, ResultDesc: "Invalid callback payload" });
    }

    const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = stkCallback;
    
    console.log(`🔍 Looking for payment with CheckoutRequestID: ${CheckoutRequestID}`);
    
    const payment = await Payment.findOne({ checkoutRequestID: CheckoutRequestID })
      .populate("buyer")
      .populate({ path: "media", populate: { path: "photographer" } });

    if (!payment) {
      console.warn("[mpesaCallback] Payment not found", { CheckoutRequestID });
      return res.status(404).json({ ResultCode: 1, ResultDesc: "Payment not found" });
    }

    console.log(`💰 Payment found: ${payment._id}, Status: ${payment.status}, Type: ${payment.cartItems?.length > 0 ? 'Cart' : payment.media ? 'Single' : 'Wallet'}`);

    if (payment.status === "completed") {
      console.log(`✅ Payment already completed`);
      return res.status(200).json({ ResultCode: 0, ResultDesc: "Payment already processed" });
    }

    if (ResultCode !== 0) {
      payment.status = "failed";
      payment.callbackData = callbackData;
      await payment.save();
      console.log(`❌ Payment failed: ${ResultDesc}`);
      return res.status(200).json({ ResultCode: 0, ResultDesc: "Payment marked failed" });
    }

    const receiptObj = (CallbackMetadata?.Item || []).find((item) => item.Name === "MpesaReceiptNumber");
    payment.mpesaReceiptNumber = receiptObj?.Value || "";
    payment.transactionId = payment.mpesaReceiptNumber || payment.checkoutRequestID || payment.merchantRequestID;
    payment.transactionDate = new Date();
    payment.status = "completed";
    payment.callbackData = callbackData;
    await payment.save();

    console.log(`✅ Payment ${payment._id} marked as completed`);

    const purchasedMedia = [];
    
    if (payment.media) {
      console.log(`📦 Processing single media purchase`);
      const media = await Media.findById(payment.media).populate("photographer");
      if (media) {
        purchasedMedia.push(media);
      }
    }
    
    if (payment.cartItems && payment.cartItems.length > 0) {
      console.log(`🛒 Processing cart purchase with ${payment.cartItems.length} items`);
      const cartIds = payment.cartItems
        .map((id) => String(id))
        .filter((id) => mongoose.Types.ObjectId.isValid(id));
      
      if (cartIds.length > 0) {
        const items = await Media.find({ _id: { $in: cartIds } }).populate("photographer");
        purchasedMedia.push(...items);
        console.log(`📦 Found ${items.length} media items in cart`);
      }
    }

    if (purchasedMedia.length > 0) {
      console.log(`📥 Updating downloads for ${purchasedMedia.length} items`);
      
      const mediaIdsToUpdate = purchasedMedia.map((m) => m._id);
      await Media.updateMany({ _id: { $in: mediaIdsToUpdate } }, { $inc: { downloads: 1 } });

      const itemsData = purchasedMedia.map((m) => ({ 
        media: m._id, 
        title: m.title, 
        price: m.price, 
        photographer: m.photographer?._id || m.photographer 
      }));

      await Receipt.create({
        buyer: payment.buyer._id || payment.buyer,
        payment: payment._id,
        items: itemsData,
        totalAmount: payment.amount,
        adminShare: payment.adminShare,
        transactionId: payment.transactionId,
        method: payment.paymentMethod || "mpesa",
        receiptNumber: `RCP-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
        status: "completed"
      });

      const Notification = (await import("../models/Notification.js")).default;
      const buyerId = payment.buyer._id || payment.buyer;

      await Notification.create({
        recipient: buyerId,
        sender: buyerId,
        type: "purchase",
        title: "Payment Successful",
        message: `Your payment for ${itemsData.length} item(s) is complete.`,
        data: { paymentId: payment._id },
        actionUrl: "/buyer/downloads",
        actionLabel: "View downloads",
        priority: "high"
      });

      const photographerPayments = new Map();
      for (const media of purchasedMedia) {
        const photographerId = media.photographer?._id?.toString() || media.photographer?.toString();
        if (photographerId) {
          const currentAmount = photographerPayments.get(photographerId) || 0;
          photographerPayments.set(photographerId, currentAmount + (media.price * 0.9));
        }
      }

      for (const [photographerId, amount] of photographerPayments) {
        await Notification.create({
          recipient: photographerId,
          sender: buyerId,
          type: "payment",
          title: "Your media was purchased",
          message: `${payment.buyer?.username || "A buyer"} purchased your media. You earned KES ${amount.toFixed(2)}.`,
          data: { paymentId: payment._id },
          actionUrl: "/photographer/sales",
          actionLabel: "View Sales",
          priority: "high"
        });
        
        const photographer = await User.findById(photographerId);
        if (photographer?.phoneNumber && amount > 0) {
          console.log(`💰 Sending B2C payout to photographer ${photographer.username}: KES ${amount.toFixed(2)}`);
          await sendMoneyToPhotographer(
            req,
            photographer.phoneNumber,
            amount,
            payment._id.toString(),
            `Payment for media sale`,
            payment
          );
        }
      }
    }

    if (payment.walletTopup) {
      console.log(`💰 Processing wallet topup for user ${payment.buyer._id}`);
      let wallet = await Wallet.findOne({ user: payment.buyer._id || payment.buyer });
      if (!wallet) {
        wallet = await Wallet.create({ user: payment.buyer._id || payment.buyer, balance: 0 });
      }
      wallet.balance += payment.amount;
      await wallet.save();

      const Notification = (await import("../models/Notification.js")).default;
      await Notification.create({
        recipient: payment.buyer._id || payment.buyer,
        sender: payment.buyer._id || payment.buyer,
        type: "payment",
        title: "Wallet top-up successful",
        message: `Your wallet was topped up with KES ${payment.amount}.`,
        data: { paymentId: payment._id },
        actionUrl: "/buyer/wallet",
        actionLabel: "View Wallet",
        priority: "high"
      });
    }

    console.log(`✅ Callback processing complete for payment ${payment._id}`);
    return res.status(200).json({ ResultCode: 0, ResultDesc: "Payment processed successfully" });

  } catch (error) {
    console.error("❌ Callback error:", error);
    return res.status(500).json({ ResultCode: 1, ResultDesc: "Internal server error" });
  }
}

async function buyMedia(req, res) {
  try {
    const { mediaId, useWallet = true } = req.body;
    const buyerId = req.body.buyerId || req.body.userId;

    if (!mediaId || !buyerId) {
      return res.status(400).json({ message: "mediaId and buyerId (or userId) are required" });
    }

    const media = await Media.findById(mediaId).populate("photographer");
    if (!media) {
      return res.status(404).json({ message: "Media not found" });
    }

    const buyer = await User.findById(buyerId);
    if (!buyer) {
      return res.status(404).json({ message: "Buyer not found" });
    }

    const price = Number(media.price || 0);
    if (price <= 0) {
      return res.status(400).json({ message: "Media has no valid price" });
    }

    if (useWallet) {
      let wallet = await Wallet.findOne({ user: buyerId });
      if (!wallet || wallet.balance < price) {
        return res.status(400).json({ message: "Insufficient wallet balance" });
      }
      wallet.balance -= price;
      await wallet.save();
    }

    const adminShare = Number((price * 0.1).toFixed(2));
    const photographerShare = Number((price - adminShare).toFixed(2));

    const payment = await Payment.create({
      buyer: buyerId,
      media: mediaId,
      amount: price,
      adminShare,
      photographerShare,
      status: "completed",
      paymentMethod: "wallet",
      transactionId: `wallet_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      transactionDate: new Date()
    });

    await Media.findByIdAndUpdate(mediaId, { $inc: { downloads: 1 } });

    const Notification = (await import("../models/Notification.js")).default;

    await Notification.create({
      recipient: buyerId,
      sender: media.photographer?._id || buyerId,
      type: "purchase",
      title: "Purchase successful",
      message: `Your purchase of '${media.title}' is complete.`,
      data: { mediaId: media._id, paymentId: payment._id },
      actionUrl: `/media/${media._id}`,
      actionLabel: "Download",
      priority: "high"
    });

    if (media.photographer) {
      await Notification.create({
        recipient: media.photographer._id || media.photographer,
        sender: buyerId,
        type: "payment",
        title: "Media sold",
        message: `Your media '${media.title}' was purchased by ${buyer.username || "a user"}.`,
        data: { mediaId: media._id, paymentId: payment._id },
        actionUrl: `/photographer/sales`,
        actionLabel: "View Sale",
        priority: "high"
      });
    }

    return res.status(201).json({ success: true, message: "Purchase completed", payment });
  } catch (error) {
    console.error("❌ buyMedia error:", error);
    return res.status(500).json({ success: false, message: "Failed to complete purchase", error: error.message });
  }
}

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

async function getPhotographerEarningsSummary(req, res) {
  try {
    const { photographerId } = req.params;
    const isAll = photographerId === "all";

    let mediaItems = [];
    if (!isAll) {
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
      total: totalEarned,
      pending: 0, // TODO: Implement pending earnings logic
      withdrawn: 0, // TODO: Implement withdrawal tracking
      available: totalEarned,
      totalSales: soldCount,
      averagePrice,
      topSellingPhoto: topSellingMedia,
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

async function getPaymentStatus(req, res) {
  try {
    const { paymentId } = req.params;
    if (!paymentId) return res.status(400).json({ message: "paymentId is required" });

    const payment = await Payment.findById(paymentId)
      .populate("buyer", "username email")
      .populate({ path: "media", populate: { path: "photographer", select: "username" } });

    if (!payment) return res.status(404).json({ message: "Payment not found" });

    return res.status(200).json(payment);
  } catch (error) {
    console.error("Error fetching payment status:", error);
    return res.status(500).json({ message: "Error fetching payment status", error: error.message });
  }
}

async function getPurchaseHistory(req, res) {
  try {
    const { userId } = req.params;

    const payments = await Payment.find({ buyer: userId, status: "completed" })
      .populate("media", "title price photographer fileUrl")
      .populate("media.photographer", "username")
      .populate("cartItems", "title price photographer fileUrl")
      .populate("cartItems.photographer", "username")
      .sort({ createdAt: -1 });

    const purchaseHistory = [];

    for (const payment of payments) {
      if (payment.media) {
        purchaseHistory.push({
          paymentId: payment._id,
          amount: payment.amount,
          mediaId: payment.media._id,
          mediaDetails: payment.media,
          title: payment.media.title,
          photographerName: payment.media.photographer?.username,
          date: payment.createdAt,
          receiptId: payment.receiptId || payment._id,
          status: payment.status,
          paymentMethod: payment.paymentMethod,
          transactionId: payment.mpesaReceiptNumber || payment.transactionId || payment.checkoutRequestID || payment.merchantRequestID,
        });
      } else if (payment.cartItems && payment.cartItems.length > 0) {
        for (const cartItem of payment.cartItems) {
          purchaseHistory.push({
            paymentId: payment._id,
            amount: payment.amount / payment.cartItems.length,
            mediaId: cartItem._id || cartItem,
            mediaDetails: cartItem,
            title: cartItem.title,
            photographerName: cartItem.photographer?.username,
            date: payment.createdAt,
            receiptId: payment.receiptId || payment._id,
            status: payment.status,
            paymentMethod: payment.paymentMethod,
            transactionId: payment.mpesaReceiptNumber || payment.transactionId || payment.checkoutRequestID || payment.merchantRequestID,
          });
        }
      }
    }

    res.status(200).json(purchaseHistory);
  } catch (error) {
    console.error("Error fetching purchase history:", error);
    res.status(500).json({
      message: "Error fetching purchase history",
      error: error.message,
    });
  }
}

async function getMpesaLogs(req, res) {
  try {
    const { q, type, source, limit = 200, page = 1 } = req.query;
    const filter = {};

    if (type) filter.eventType = type;
    if (source) filter.source = source;

    if (q) {
      filter.$or = [
        { transactionId: new RegExp(q, "i") },
        { merchantRequestID: new RegExp(q, "i") },
        { checkoutRequestID: new RegExp(q, "i") },
        { phoneNumber: new RegExp(q, "i") },
      ];
    }

    const logs = await MpesaLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    const total = await MpesaLog.countDocuments(filter);

    res.status(200).json({
      data: logs,
      meta: { total, page: Number(page), limit: Number(limit) },
    });
  } catch (error) {
    console.error("Error fetching mpesa logs:", error);
    res.status(500).json({ message: "Error fetching mpesa logs", error: error.message });
  }
}

async function getMpesaRetries(req, res) {
  try {
    const retries = await MpesaRetry.find().sort({ createdAt: -1 }).limit(100);
    res.status(200).json(retries);
  } catch (error) {
    console.error("Error fetching mpesa retries:", error);
    res.status(500).json({ message: "Error fetching mpesa retries", error: error.message });
  }
}

async function getAdminDashboard(req, res) {
  try {
    const completedPayments = await Payment.find({ status: "completed" })
      .populate("buyer", "username email")
      .populate("media", "title price photographer")
      .populate({
        path: 'media',
        populate: { path: 'photographer', select: 'username email' }
      })
      .sort({ createdAt: -1 });

    const totalRevenue = completedPayments.reduce((sum, p) => sum + (p.adminShare || 0), 0);
    const totalSales = completedPayments.length;
    const totalPhotographerEarnings = completedPayments.reduce((sum, p) => sum + (p.photographerShare || 0), 0);
    const totalBuyers = await User.countDocuments({ role: 'user' });
    const totalPhotographers = await User.countDocuments({ role: 'photographer' });
    const totalAdmins = await User.countDocuments({ role: 'admin' });
    const totalMedia = await Media.countDocuments();
    const totalAlbums = await Album.countDocuments();
    const pendingRefunds = await Refund.countDocuments({ status: 'pending' });
    const recentPayments = completedPayments.slice(0, 20);

    res.status(200).json({
      success: true,
      stats: {
        totalRevenue,
        totalSales,
        totalPhotographerEarnings,
        totalBuyers,
        totalPhotographers,
        totalAdmins,
        totalMedia,
        totalAlbums,
        pendingRefunds
      },
      recentPayments,
      completedPayments: recentPayments
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
  getPurchaseHistory,
  getPaymentStatus,
  getMpesaLogs,
  getMpesaRetries,
  processPendingB2cRetries
};
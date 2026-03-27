import axios from "axios";

/**
 * M-Pesa Configuration Diagnostics
 * Run this to check if all M-Pesa settings are properly configured
 */
export async function checkMpesaConfiguration(req, res) {
  try {
    const config = {
      consumerKey: !!process.env.MPESA_CONSUMER_KEY,
      consumerSecret: !!process.env.MPESA_SECRET_KEY,
      shortCode: !!process.env.MPESA_BUSINESS_SHORTCODE || !!process.env.MPESA_SHORTCODE,
      passkey: !!process.env.MPESA_PASSKEY,
      securityCredential: !!process.env.MPESA_SECURITY_CREDENTIAL,
      initiatorName: !!process.env.MPESA_INITIATOR_NAME,
      env: process.env.MPESA_ENV || process.env.MPESA_ENVIRONMENT || "sandbox",
      baseUrl: process.env.BASE_URL || "NOT SET",
      callbackUrl: process.env.MPESA_CALLBACK_URL || "NOT SET",
      adminPhone: process.env.ADMIN_PHONE_NUMBER || "254793945789"
    };

    const issues = [];
    const warnings = [];

    // Check required fields
    if (!config.consumerKey) issues.push("❌ MPESA_CONSUMER_KEY not set");
    if (!config.consumerSecret) issues.push("❌ MPESA_SECRET_KEY not set");
    if (!config.shortCode) issues.push("❌ MPESA_BUSINESS_SHORTCODE/MPESA_SHORTCODE not set");
    if (!config.passkey) issues.push("❌ MPESA_PASSKEY not set");
    if (!config.env.includes("sandbox") && !config.env.includes("production")) {
      warnings.push("⚠️ MPESA_ENV should be either 'sandbox' or 'production'");
    }
    if (!config.baseUrl.includes("http")) {
      warnings.push("⚠️ BASE_URL should be a full HTTPS URL for production callbacks");
    }
    if (!config.securityCredential && config.env === "production") {
      warnings.push("⚠️ MPESA_SECURITY_CREDENTIAL missing - B2C payouts will fail");
    }

    res.status(200).json({
      success: true,
      environment: "current",
      config,
      issues,
      warnings,
      recommendation: issues.length === 0 ? "✅ Configuration looks good!" : `❌ Fix ${issues.length} issue(s) before proceeding`
    });
  } catch (error) {
    console.error("[checkMpesaConfiguration] Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Validate phone number format
 * Expected format: 254XXXXXXXXX (12 digits total, starts with 254)
 */
export function validatePhoneFormat(phone) {
  const phoneRegex = /^254\d{9}$/;
  return phoneRegex.test(phone);
}

/**
 * Helper: Format phone number from various formats to 254XXXXXXXXX
 */
export function formatPhoneNumber(phone) {
  if (!phone) return null;
  
  // Remove spaces, hyphens, parentheses
  let cleaned = phone.replace(/[\s\-()]/g, '');
  
  // Remove leading +
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }
  
  // If it starts with 0, replace with 254
  if (cleaned.startsWith('0')) {
    cleaned = '254' + cleaned.substring(1);
  }
  
  // If it's just 9 digits, prepend 254
  if (cleaned.length === 9) {
    cleaned = '254' + cleaned;
  }
  
  return cleaned;
}

/**
 * Test M-Pesa credentials by getting access token
 */
export async function testMpesaCredentials(req, res) {
  try {
    const consumerKey = process.env.MPESA_CONSUMER_KEY;
    const consumerSecret = process.env.MPESA_SECRET_KEY;
    const env = process.env.MPESA_ENV || process.env.MPESA_ENVIRONMENT || "sandbox";

    if (!consumerKey || !consumerSecret) {
      return res.status(400).json({
        success: false,
        message: "Missing MPESA_CONSUMER_KEY or MPESA_SECRET_KEY",
        test: "FAILED"
      });
    }

    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
    const url = env === "sandbox"
      ? "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials"
      : "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";

    const response = await axios.get(url, {
      headers: { Authorization: `Basic ${auth}` },
      timeout: 10000
    });

    res.status(200).json({
      success: true,
      test: "PASSED",
      message: "✅ Credentials are valid",
      accessToken: response.data.access_token?.substring(0, 20) + "...",
      expiresIn: response.data.expires_in
    });
  } catch (error) {
    console.error("[testMpesaCredentials] Error:", error.response?.data || error.message);
    res.status(400).json({
      success: false,
      test: "FAILED",
      message: "Invalid M-Pesa credentials",
      error: error.response?.data || error.message
    });
  }
}

/**
 * Get M-Pesa payment status by CheckoutRequestID
 */
export async function getPaymentStatus(req, res) {
  try {
    const { checkoutRequestId } = req.params;

    if (!checkoutRequestId) {
      return res.status(400).json({ message: "checkoutRequestId required" });
    }

    const Payment = (await import("../models/Payment.js")).default;
    const payment = await Payment.findOne({ checkoutRequestID: checkoutRequestId })
      .populate("buyer", "username email")
      .populate("media", "title price")
      .populate("photographer", "username");

    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    res.status(200).json({
      success: true,
      payment: {
        id: payment._id,
        status: payment.status,
        amount: payment.amount,
        checkoutRequestID: payment.checkoutRequestID,
        mpesaReceiptNumber: payment.mpesaReceiptNumber || "PENDING",
        phoneNumber: payment.phoneNumber,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
        buyer: payment.buyer?.username,
        media: payment.media?.title,
        photographer: payment.photographer?.username
      }
    });
  } catch (error) {
    console.error("[getPaymentStatus] Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Get recent M-Pesa logs
 */
export async function getMpesaLogs(req, res) {
  try {
    const { limit = 50, eventType = null } = req.query;

    const MpesaLog = (await import("../models/MpesaLog.js")).default;

    let filter = {};
    if (eventType) filter.eventType = eventType;

    const logs = await MpesaLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .lean();

    res.status(200).json({
      success: true,
      count: logs.length,
      logs
    });
  } catch (error) {
    console.error("[getMpesaLogs] Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Get retry queue status
 */
export async function getMpesaRetryQueue(req, res) {
  try {
    const MpesaRetry = (await import("../models/MpesaRetry.js")).default;

    const pending = await MpesaRetry.find({ status: "pending" })
      .populate("payment", "checkoutRequestID amount")
      .sort({ nextAttemptAt: 1 })
      .lean();

    const processing = await MpesaRetry.find({ status: "processing" })
      .populate("payment", "checkoutRequestID amount")
      .lean();

    const failed = await MpesaRetry.find({ status: "failed" })
      .populate("payment", "checkoutRequestID amount")
      .limit(20)
      .lean();

    res.status(200).json({
      success: true,
      queue: {
        pending: pending.length,
        processing: processing.length,
        failed: failed.length
      },
      details: {
        pending,
        processing,
        failed
      }
    });
  } catch (error) {
    console.error("[getMpesaRetryQueue] Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

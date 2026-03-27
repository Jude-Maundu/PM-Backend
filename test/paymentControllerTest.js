import { strict as assert } from "assert";
import Payment from "../models/Payment.js";
import Media from "../models/media.js";
import Receipt from "../models/Receipt.js";
import Wallet from "../models/Wallet.js";
import Notification from "../models/Notification.js";
import Cart from "../models/Cart.js";
import { mpesaCallback } from "../controllers/paymentController.js";

async function run() {
  const savedFlag = { value: false };
  const paymentData = {
    _id: "p1",
    buyer: { _id: "u1", username: "buyer1" },
    media: { _id: "m1", title: "Photo1", photographer: { _id: "ph1", username: "ph1" } },
    amount: 100,
    adminShare: 0,
    photographerShare: 90,
    status: "pending",
    paymentMethod: "mpesa",
    checkoutRequestID: "checkout123",
    mpesaReceiptNumber: null,
    callbackData: null,
    save: async function () { savedFlag.value = true; return this; },
    populate() { return this; }
  };

  // Mongoose static methods mocks
  Payment.findOne = () => paymentData;
  Media.findByIdAndUpdate = async () => ({});
  Receipt.findOne = async () => null;
  Receipt.create = async (obj) => ({ ...obj, _id: "receipt-1" });
  Wallet.findOne = async () => null;
  Wallet.create = async (obj) => ({ ...obj, _id: "wallet-1", save: async () => obj });
  Notification.create = async (obj) => ({ ...obj, _id: "note-1" });
  Cart.updateOne = async () => ({});

  // Set environment inputs (inflow from MPESA callback)
  const req = {
    body: {
      Body: {
        stkCallback: {
          CheckoutRequestID: "checkout123",
          ResultCode: 0,
          ResultDesc: "The service request is processed successfully.",
          CallbackMetadata: {
            Item: [
              { Name: "MpesaReceiptNumber", Value: "ABCD1234" }
            ]
          }
        }
      }
    },
    get() { return "example.com"; },
    headers: { "x-forwarded-proto": "https" },
    protocol: "https"
  };

  let statusCode;
  let jsonData;
  const res = {
    status(code) { statusCode = code; return this; },
    json(data) { jsonData = data; return this; }
  };

  await mpesaCallback(req, res);

  assert.equal(statusCode, 200, "Expected response status 200");
  assert.equal(jsonData.ResultCode, 0);
  assert.equal(jsonData.ResultDesc, "Success");
  assert.equal(paymentData.status, "completed");
  assert.equal(paymentData.mpesaReceiptNumber, "ABCD1234");
  assert.ok(savedFlag.value, "Payment save called");

  console.log("✅ paymentController mpesaCallback manual test passed");
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

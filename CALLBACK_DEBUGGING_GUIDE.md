# M-Pesa Callback Flow - Debugging Guide

## 🔄 How the Callback Works

### 1. **Frontend Sends Payment Request**
```javascript
POST /api/payments/mpesa
{
  mediaId: "xxx",
  buyerId: "yyy",
  buyerPhone: "254712345678"
}
```

### 2. **Backend Initiates STK Push**
Backend generates:
- `CheckoutRequestID` → Unique ID for this transaction
- `MerchantRequestID` → M-Pesa's internal ID

Saves to Payment collection with status: `"pending"`

Response example:
```json
{
  "CheckoutRequestID": "ws_CO_DMZ_0123456789012345678",
  "MerchantRequestID": "MTc5NzQ2OTAxMQ=="
}
```

### 3. **M-Pesa Sends Callback (Async)**
M-Pesa → Backend `POST /api/payments/callback`
```json
{
  "Body": {
    "stkCallback": {
      "MerchantRequestID": "MTc5NzQ2OTAxMQ==",
      "CheckoutRequestID": "ws_CO_DMZ_0123456789012345678",
      "ResultCode": 0,
      "ResultDesc": "The service request has been processed successfully.",
      "CallbackMetadata": {
        "Item": [
          {
            "Name": "Amount",
            "Value": 100
          },
          {
            "Name": "MpesaReceiptNumber",
            "Value": "NL5K2FSWJ7"
          },
          {
            "Name": "TransactionDate",
            "Value": 20240321125645
          },
          {
            "Name": "PhoneNumber",
            "Value": 254712345678
          }
        ]
      }
    }
  }
}
```

### 4. **Backend Updates Payment Status**
- Finds Payment by `CheckoutRequestID`
- Updates status from `"pending"` → `"completed"` or `"failed"`
- Extracts M-Pesa receipt number
- Sends money to photographer (B2C)
- Updates media downloads counter

### 5. **Backend Responds to M-Pesa**
```json
{
  "ResultCode": 0,
  "ResultDesc": "Success"
}
```
(M-Pesa doesn't use this response, just expects 200 OK)

---

## ⚠️ Common Callback Issues

### Issue 1: Callback URL Mismatch
**Problem:** Backend tells M-Pesa to send callback to wrong URL

**Current Setup:**
- Backend code sends to: `/api/payments/callback` ✅
- Route exists at: `/api/payments/callback` ✅
- Redundant route at: `/mpesa-callback` (unused)

**Solution:** Remove the redundant `/mpesa-callback` route from server.js

---

### Issue 2: Callback Never Arrives
**Causes:**
- M-Pesa credentials (consumerKey, consumerSecret) missing/wrong
- STK Push failed (wrong response from M-Pesa)
- Backend not accessible from M-Pesa (firewall, SSL certificate)
- Callback URL has wrong domain

**Check:**
1. STK Push response has `CheckoutRequestID`
2. Backend server is public (not localhost)
3. Backend is using HTTPS in production
4. Check backend logs for incoming callbacks

**Debug:**
```bash
# Check if backend is receiving callbacks
curl -X POST http://localhost:4000/api/payments/callback \
  -H "Content-Type: application/json" \
  -d '{
    "Body": {
      "stkCallback": {
        "CheckoutRequestID": "test123",
        "ResultCode": 0
      }
    }
  }'
```

---

### Issue 3: Payment Record Not Found
```json
{
  "ResultCode": 1,
  "ResultDesc": "Payment not found"
}
```

**Causes:**
- `CheckoutRequestID` in callback doesn't match database
- Payment was saved with different ID format
- Database query failed

**Debug:**
```javascript
// Add this to paymentController.js payWithMpesa():
console.log("🔑 CheckoutRequestID saved:", stkResponse.data.CheckoutRequestID);

// Add this to mpesaCallback():
console.log("🔍 Looking for payment with:", CheckoutRequestID);
```

---

### Issue 4: CallbackMetadata Not Parsed Correctly
```javascript
// Expected structure
CallbackMetadata: {
  Item: [
    { Name: "Amount", Value: 100 },
    { Name: "MpesaReceiptNumber", Value: "NL5K2FSWJ7" }
  ]
}

// Bug: Accessing directly instead of mapping
const amount = CallbackMetadata.Item[0].Value // Works if array index is known
const receipt = CallbackMetadata.Item.find(item => item.Name === "MpesaReceiptNumber").Value // Works - current implementation ✅
```

---

## 🔧 How to Test the Callback

### Test 1: Manual Callback Test
```bash
curl -X POST https://your-backend.com/api/payments/callback \
  -H "Content-Type: application/json" \
  -d '{
    "Body": {
      "stkCallback": {
        "MerchantRequestID": "test-merchant-123",
        "CheckoutRequestID": "REPLACE_WITH_REAL_CHECKOUT_ID",
        "ResultCode": 0,
        "ResultDesc": "The service request has been processed successfully.",
        "CallbackMetadata": {
          "Item": [
            { "Name": "Amount", "Value": 100 },
            { "Name": "MpesaReceiptNumber", "Value": "NL5K2FSWJ7" },
            { "Name": "TransactionDate", "Value": 20240321125645 },
            { "Name": "PhoneNumber", "Value": 254712345678 }
          ]
        }
      }
    }
  }'
```

### Test 2: Check Backend Logs
```bash
# Look for callback logs
tail -f backend.log | grep "MPESA CALLBACK"
tail -f backend.log | grep "CheckoutRequestID"
tail -f backend.log | grep "Payment found"
```

### Test 3: Monitor Database
```javascript
// Check Payment records in MongoDB
db.payments.find({ status: "pending" })
db.payments.find({ status: "completed" })
db.payments.find({ checkoutRequestID: "YOUR_CHECKOUT_ID" })
```

---

## ✅ Proper Callback Flow (Step-by-Step)

1. **Frontend requests M-Pesa payment**
   ```
   POST /api/payments/mpesa
   → Backend gets access token
   → Backend initiates STK Push
   → M-Pesa returns CheckoutRequestID
   → Backend saves to Payment collection
   → Frontend gets CheckoutRequestID
   ```

2. **User enters M-Pesa PIN on phone**
   ```
   M-Pesa → Backend (async)
   POST /api/payments/callback
   → Backend finds Payment by CheckoutRequestID
   → Updates status: pending → completed
   → Sends money to photographer (B2C)
   → Backend responds with ResultCode: 0
   ```

3. **Frontend polls for payment status** (Optional but recommended)
   ```
   GET /api/payments/status/{checkoutRequestId}
   → Backend checks Payment collection
   → Returns status: completed/failed/pending
   ```

---

## 📋 Callback Debugging Checklist

- [ ] STK Push request succeeds (CheckoutRequestID in response)
- [ ] CheckoutRequestID is saved to Payment collection
- [ ] Backend CloudFlare/Render URL is public
- [ ] Callback URL in code uses correct domain (not localhost)
- [ ] M-Pesa credentials are correct
- [ ] Backend logs show "MPESA CALLBACK RECEIVED"
- [ ] BackendFinding Payment record by CheckoutRequestID
- [ ] Payment status updating to "completed"
- [ ] Media downloads counter incrementing
- [ ] B2C payment to photographer completing
- [ ] No 404/500 errors in logs

---

## 🚨 Current Status

**Callback Route:** `/api/payments/callback` ✅ Correct
**Redundant Route:** `/mpesa-callback` needs to be removed

**Next Steps:**
1. Remove duplicate route from server.js
2. Test full payment flow (Frontend → STK → Callback)
3. Monitor backend logs during test
4. Check Payment collection after callback arrives

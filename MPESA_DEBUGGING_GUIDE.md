# M-Pesa Payment Integration - Debugging Guide

## 🔴 Your Current Error
```
POST https://pm-backend-f3b6.onrender.com/api/payments/mpesa 400 (Bad Request)
Some MPesa checkout requests failed (2)
```

---

## ✅ What the Backend Expects

### Endpoint
```
POST /api/payments/mpesa
Content-Type: application/json
```

### Required Request Body

**For Media Purchase:**
```json
{
  "mediaId": "507f1f77bcf86cd799439011",  // MongoDB ObjectId - REQUIRED
  "buyerId": "507f1f77bcf86cd799439012",  // MongoDB ObjectId - REQUIRED
  "buyerPhone": "254712345678",           // Format: 254 + 9 digits - REQUIRED
  "walletTopup": false                    // OPTIONAL (omit or false for media purchase)
}
```

**For Wallet Top-up:**
```json
{
  "buyerId": "507f1f77bcf86cd799439012",  // MongoDB ObjectId - REQUIRED
  "buyerPhone": "254712345678",           // Format: 254 + 9 digits - REQUIRED
  "amount": 100,                          // Must be > 0 - REQUIRED
  "walletTopup": true                     // REQUIRED for top-up
}
```

---

## ❌ Common 400 Errors & Solutions

### Error 1: Missing Required Fields
```json
{
  "message": "Missing required fields: buyerPhone, buyerId, and mediaId for purchase or walletTopup flag"
}
```

**Causes:**
- `buyerPhone` is missing or empty
- `buyerId` is missing or empty
- `mediaId` is missing (for media purchase)
- Not sending `walletTopup: true` for wallet top-up

**Solution:**
```javascript
// ✅ CORRECT - Media Purchase
const payload = {
  mediaId: "507f1f77bcf86cd799439011",
  buyerId: userId,
  buyerPhone: userPhone,
  walletTopup: false  // Optional
};

// ✅ CORRECT - Wallet Top-up
const payload = {
  buyerId: userId,
  buyerPhone: userPhone,
  amount: 100,
  walletTopup: true  // REQUIRED
};
```

---

### Error 2: Invalid Phone Number Format
```json
{
  "message": "Invalid phone number format. Use 254XXXXXXXXX (e.g., 254712345678)"
}
```

**The regex validation is:** `/^254\d{9}$/`

**Valid examples:**
- ✅ `254712345678` (254 + 9 digits)
- ✅ `254789123456`
- ✅ `254700000001`

**Invalid examples:**
- ❌ `0712345678` (leading zero instead of 254)
- ❌ `+254712345678` (has plus sign)
- ❌ `712345678` (missing country code)
- ❌ `254712345` (only 8 digits after 254)
- ❌ `2547123456789` (10 digits after 254)

**Solution:**
```javascript
// Convert phone number to correct format
function formatPhoneNumber(phone) {
  // Remove leading zeros if present
  if (phone.startsWith('0')) {
    phone = phone.substring(1);
  }
  // Remove plus sign if present
  phone = phone.replace('+', '');
  // Add country code if missing
  if (!phone.startsWith('254')) {
    phone = '254' + phone;
  }
  return phone;
}

// Usage
const buyerPhone = formatPhoneNumber(userPhoneFromForm); // "254712345678"
```

---

### Error 3: Missing M-Pesa Configuration
```json
{
  "message": "MPesa configuration incomplete. Check environment variables.",
  "missing": {
    "consumerKey": true,
    "consumerSecret": true,
    "shortCode": false,
    "passkey": true
  }
}
```

**Required environment variables in backend `.env`:**
```bash
MPESA_CONSUMER_KEY=xxxxx
MPESA_SECRET_KEY=xxxxx
MPESA_SHORTCODE=174379
MPESA_PASSKEY=xxxxx
MPESA_ENVIRONMENT=sandbox # or production
MPESA_INITIATOR_NAME=testapi
MPESA_INITIATOR_PASSWORD=xxxxx
ADMIN_PHONE_NUMBER=254793945789
```

---

### Error 4: Invalid IDs (mediaId or buyerId)
```json
{
  "message": "Media not found" // OR "Buyer not found"
}
```

**Causes:**
- `mediaId` doesn't exist in database
- `buyerId` doesn't exist in database
- ID format is wrong (not a valid MongoDB ObjectId)

**Solution:**
```javascript
// Verify IDs are valid MongoDB ObjectIds
const isValidObjectId = (id) => /^[0-9a-fA-F]{24}$/.test(id);

if (!isValidObjectId(mediaId)) {
  console.error("Invalid mediaId format");
  return;
}
```

---

## 🔍 Debugging Steps

### Step 1: Check Network Request in Browser
1. Open DevTools → Network tab
2. Click the failed M-Pesa request
3. Go to "Payload" tab
4. Verify it contains:
   - `mediaId` (24-character hex string)
   - `buyerId` (24-character hex string)
   - `buyerPhone` (format: 254XXXXXXXXX)

### Step 2: Log the Payload in Frontend
```javascript
// In BuyerCart.jsx handleMpesaCheckout function
const payload = {
  mediaId: item._id,
  buyerId: user._id,
  buyerPhone: formatPhoneNumber(user.phoneNumber),
  walletTopup: false
};

console.log("📤 Sending M-Pesa payload:", payload);
console.log("✓ mediaId valid:", payload.mediaId?.length === 24);
console.log("✓ buyerId valid:", payload.buyerId?.length === 24);
console.log("✓ phone valid:", /^254\d{9}$/.test(payload.buyerPhone));

const response = await axios.post(
  `${API_BASE_URL}/payments/mpesa`,
  payload
);
```

### Step 3: Check Backend Logs
The backend logs will show exactly what's failing:
```
Missing required fields: buyerPhone, buyerId...
Invalid phone number format...
MPesa configuration incomplete...
Media not found
Buyer not found
```

---

## 📱 Phone Number Reference

### Kenyan Phone Format
- **Safaricom:** 0701-0799, 0741-0748
- **Airtel:** 0801-0811, 0814-0815
- **Equitel:** 0518, 0701

### Conversion Table
| Stored In Form | Convert To |
|--|--|
| `0712345678` | `254712345678` |
| `+254712345678` | `254712345678` |
| `712345678` | `254712345678` |

---

## ✨ Correct Frontend Implementation Example

```javascript
async function handleMpesaCheckout(cartItems, user) {
  try {
    // Format phone number
    const buyerPhone = user.phoneNumber.startsWith('254') 
      ? user.phoneNumber 
      : '254' + user.phoneNumber.replace(/^0/, '');

    // Send requests for each item
    const requests = cartItems.map(item =>
      axios.post(`${API_BASE_URL}/payments/mpesa`, {
        mediaId: item._id,
        buyerId: user._id,
        buyerPhone: buyerPhone,
        walletTopup: false
      })
    );

    const responses = await Promise.allSettled(requests);
    
    // Check results
    const failed = responses.filter(r => r.status === 'rejected');
    if (failed.length > 0) {
      console.error("❌ Payment failed:", failed[0].reason.response?.data);
    } else {
      console.log("✅ Payment successful");
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}
```

---

## 🎯 Quick Checklist

- [ ] Phone number starts with `254` (not `0` or `+254`)
- [ ] Phone number format is exactly 11 digits: `254` + 9 digits
- [ ] `mediaId` is a 24-character MongoDB ID
- [ ] `buyerId` is a 24-character MongoDB ID
- [ ] `buyerId` exists in the User collection
- [ ] `mediaId` exists in the Media collection
- [ ] Backend has M-Pesa credentials in `.env`
- [ ] Using correct backend URL (check API_BASE_URL)
- [ ] Content-Type is `application/json`

---

## 📞 Support

If you still see `400 Bad Request`:
1. Check browser DevTools → Network → Payload
2. Check backend logs for specific error message
3. Verify all fields match validation regex
4. Ensure user and media exist in database

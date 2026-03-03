# PhotoMarket API Documentation

**Base URL:** `https://pm-backend-1-0s8f.onrender.com/api`

---

## 🔐 Authentication Endpoints

### Register User
- **Method:** POST
- **Endpoint:** `/auth/register`
- **Body:** 
  ```json
  {
    "username": "string",
    "email": "string",
    "password": "string",
    "role": "buyer|photographer|admin",
    "profilePicture": "file (optional)"
  }
  ```
- **Response:** User object with token

### Login User
- **Method:** POST
- **Endpoint:** `/auth/login`
- **Body:** 
  ```json
  {
    "email": "string",
    "password": "string"
  }
  ```
- **Response:** User object with token

### Get All Users
- **Method:** GET
- **Endpoint:** `/auth/users`
- **Headers:** Authorization (token)
- **Response:** Array of users

### Get Single User
- **Method:** GET
- **Endpoint:** `/auth/users/:id`
- **Headers:** Authorization (token)
- **Response:** User object

### Update User
- **Method:** PUT
- **Endpoint:** `/auth/users/:id`
- **Headers:** Authorization (token)
- **Body:** User data to update
- **Response:** Updated user object

### Delete User
- **Method:** DELETE
- **Endpoint:** `/auth/users/:id`
- **Headers:** Authorization (token)
- **Response:** Success message

### Update Photographer Phone
- **Method:** PUT
- **Endpoint:** `/auth/photographers/:id/phone`
- **Body:** `{ "phoneNumber": "string" }`
- **Response:** Updated photographer object

---

## 📸 Media Endpoints

### Get All Media
- **Method:** GET
- **Endpoint:** `/media`
- **Response:** Array of media objects

### Get Single Media
- **Method:** GET
- **Endpoint:** `/media/:id`
- **Response:** Media object

### Get Protected Media (Download)
- **Method:** GET
- **Endpoint:** `/media/:id/protected`
- **Headers:** Authorization (token)
- **Response:** Signed download URL

### Create Media
- **Method:** POST
- **Endpoint:** `/media`
- **Headers:** Authorization (token), Content-Type: multipart/form-data
- **Body:** FormData with file and media details
- **Response:** Created media object

### Update Media
- **Method:** PUT
- **Endpoint:** `/media/:id`
- **Headers:** Authorization (token), Content-Type: multipart/form-data
- **Body:** FormData with updated media details
- **Response:** Updated media object

### Update Media Price
- **Method:** PUT
- **Endpoint:** `/media/:id/price`
- **Headers:** Authorization (token)
- **Body:** `{ "price": number }`
- **Response:** Updated media object

### Delete Media
- **Method:** DELETE
- **Endpoint:** `/media/:id`
- **Headers:** Authorization (token)
- **Response:** Success message

---

## 💳 Payment Endpoints

### Initiate M-Pesa Payment
- **Method:** POST
- **Endpoint:** `/payments/mpesa`
- **Body:** 
  ```json
  {
    "mediaId": "string",
    "buyerPhone": "string (254XXXXXXXXX)",
    "buyerId": "string"
  }
  ```
- **Response:** STK Push response with CheckoutRequestID

### M-Pesa Callback
- **Method:** POST
- **Endpoint:** `/payments/callback`
- **Body:** M-Pesa callback data
- **Response:** `{ "ResultCode": 0, "ResultDesc": "Success" }`

### Buy Media (Mock Payment)
- **Method:** POST
- **Endpoint:** `/payments/buy`
- **Headers:** Authorization (token)
- **Body:** 
  ```json
  {
    "mediaId": "string",
    "buyerId": "string"
  }
  ```
- **Response:** Payment confirmation

### Get Purchase History
- **Method:** GET
- **Endpoint:** `/payments/purchase-history/:userId`
- **Headers:** Authorization (token)
- **Response:** Array of purchases

### Get Photographer Earnings
- **Method:** GET
- **Endpoint:** `/payments/earnings/:photographerId`
- **Headers:** Authorization (token)
- **Response:** 
  ```json
  {
    "sales": "array",
    "totalSales": "number",
    "totalEarned": "number"
  }
  ```

### Get Photographer Earnings Summary
- **Method:** GET
- **Endpoint:** `/payments/earnings-summary/:photographerId`
- **Headers:** Authorization (token)
- **Response:** 
  ```json
  {
    "earnings": { "totalEarned": "number", "currentBalance": "number" },
    "sales": { "totalSales": "number", "averagePrice": "number" },
    "recentSales": "array"
  }
  ```

### Get Admin Dashboard
- **Method:** GET
- **Endpoint:** `/payments/admin/dashboard`
- **Headers:** Authorization (token)
- **Response:** Dashboard data with revenue and sales info

---

## 🛒 Cart Endpoints

### Get User Cart
- **Method:** GET
- **Endpoint:** `/payments/cart/:userId`
- **Headers:** Authorization (token)
- **Response:** Cart object with items

### Add to Cart
- **Method:** POST
- **Endpoint:** `/payments/cart/add`
- **Headers:** Authorization (token)
- **Body:** `{ "userId": "string", "mediaId": "string" }`
- **Response:** Updated cart

### Remove from Cart
- **Method:** POST
- **Endpoint:** `/payments/cart/remove`
- **Headers:** Authorization (token)
- **Body:** `{ "userId": "string", "mediaId": "string" }`
- **Response:** Updated cart

### Clear Cart
- **Method:** DELETE
- **Endpoint:** `/payments/cart/:userId`
- **Headers:** Authorization (token)
- **Response:** Empty cart

---

## 📄 Receipt Endpoints

### Create Receipt
- **Method:** POST
- **Endpoint:** `/payments/receipt/create`
- **Headers:** Authorization (token)
- **Body:** `{ "paymentId": "string", "downloadUrl": "string" }`
- **Response:** Receipt object

### Get Receipt
- **Method:** GET
- **Endpoint:** `/payments/receipt/:receiptId`
- **Headers:** Authorization (token)
- **Response:** Receipt object

### Get User Receipts
- **Method:** GET
- **Endpoint:** `/payments/receipts/:userId`
- **Headers:** Authorization (token)
- **Response:** Array of receipts

### Get All Receipts (Admin)
- **Method:** GET
- **Endpoint:** `/payments/admin/receipts`
- **Headers:** Authorization (token, admin role)
- **Response:** Array of all receipts

---

## 🔄 Refund Endpoints

### Request Refund
- **Method:** POST
- **Endpoint:** `/payments/refund/request`
- **Headers:** Authorization (token)
- **Body:** `{ "paymentId": "string", "reason": "string" }`
- **Response:** Refund object

### Get User Refunds
- **Method:** GET
- **Endpoint:** `/payments/refunds/:userId`
- **Headers:** Authorization (token)
- **Response:** Array of refunds

### Approve Refund (Admin)
- **Method:** POST
- **Endpoint:** `/payments/refund/approve`
- **Headers:** Authorization (token, admin role)
- **Body:** `{ "refundId": "string" }`
- **Response:** Updated refund

### Reject Refund (Admin)
- **Method:** POST
- **Endpoint:** `/payments/refund/reject`
- **Headers:** Authorization (token, admin role)
- **Body:** `{ "refundId": "string", "reason": "string" }`
- **Response:** Updated refund

### Process Refund (Admin)
- **Method:** POST
- **Endpoint:** `/payments/refund/process`
- **Headers:** Authorization (token, admin role)
- **Body:** `{ "refundId": "string" }`
- **Response:** Updated refund

### Get All Refunds (Admin)
- **Method:** GET
- **Endpoint:** `/payments/admin/refunds`
- **Headers:** Authorization (token, admin role)
- **Response:** Array of all refunds

---

## 💰 Wallet Endpoints

### Get Wallet Balance
- **Method:** GET
- **Endpoint:** `/payments/wallet/:userId`
- **Headers:** Authorization (token)
- **Response:** 
  ```json
  {
    "userId": "string",
    "balance": "number",
    "totalSpent": "number",
    "totalRefunded": "number",
    "netBalance": "number"
  }
  ```

### Get Transactions
- **Method:** GET
- **Endpoint:** `/payments/transactions/:userId`
- **Headers:** Authorization (token)
- **Response:** Array of transactions

### Add Funds to Wallet
- **Method:** POST
- **Endpoint:** `/payments/wallet/add`
- **Headers:** Authorization (token)
- **Body:** `{ "userId": "string", "amount": "number" }`
- **Response:** Confirmation with new balance

---

## 🔑 Authentication

All protected endpoints require:
- **Header:** `Authorization: Bearer <token>`

Tokens are obtained from login/register endpoints and stored in localStorage.

---

## 📝 Environment Variables (Backend)

```
PORT=4000
MONGODB_URI=<your_mongodb_uri>
JWT_SECRET=<your_jwt_secret>
MPESA_CONSUMER_KEY=<your_mpesa_key>
MPESA_SECRET_KEY=<your_mpesa_secret>
MPESA_SHORTCODE=174379
MPESA_PASSKEY=<your_mpesa_passkey>
MPESA_ENVIRONMENT=sandbox
BASE_URL=https://pm-backend-1-0s8f.onrender.com
```

---

## ✅ All Endpoints Summary

| Category | Count | Status |
|----------|-------|--------|
| Auth | 7 | ✅ Working |
| Media | 7 | ✅ Working |
| Payments | 8 | ✅ Working |
| Cart | 4 | ✅ Working |
| Receipts | 4 | ✅ Working |
| Refunds | 6 | ✅ Working |
| Wallet | 3 | ✅ Working |
| **Total** | **39** | **✅ All Mapped** |

---

## 📌 Notes

1. All timestamps are in ISO 8601 format
2. All monetary amounts are in KES (Kenyan Shilling)
3. Phone numbers must be in format: 254XXXXXXXXX (e.g., 254712345678)
4. Admin role is required for admin-only endpoints
5. Photographer and Buyer endpoints require respective roles
6. All file uploads use multipart/form-data
7. M-Pesa sandbox environment is used by default
8. Base URL can be changed via environment variables

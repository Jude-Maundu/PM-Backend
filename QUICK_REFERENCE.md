# 🚀 PhotoMarket - Quick Reference Card

## 📍 Backend URL
```
https://pm-backend-1-0s8f.onrender.com/api
```

## 🔑 Authentication
```
Token saved in: localStorage.getItem("token")
User saved in: localStorage.getItem("user")
Header format: Authorization: Bearer <token>
Clear on logout: localStorage.clear()
```

## 📂 Key Files

| File | Purpose | Location |
|------|---------|----------|
| apiConfig.js | All API endpoints | `frontend/src/api/apiConfig.js` |
| ProtectedRoute.jsx | Route protection | `frontend/src/Components/ProtectedRoute.jsx` |
| App.js | Route definitions | `frontend/src/App.js` |
| PayementRoutes.js | Backend payment routes | `Backend/routes/PayementRoutes.js` |
| walletController.js | Wallet operations | `Backend/controllers/walletController.js` |

## 🔗 39 Total Endpoints

### Core Routes
```
AUTH      → 7 endpoints (register, login, users)
MEDIA     → 7 endpoints (crud, protected download)
PAYMENTS  → 8 endpoints (mpesa, purchases, earnings)
CART      → 4 endpoints (add, remove, clear)
RECEIPTS  → 4 endpoints (create, view)
REFUNDS   → 6 endpoints (request, approve, process)
WALLET    → 3 endpoints (balance, transactions, add)
```

## 💻 How to Use API Config

```javascript
// Import
import { API_ENDPOINTS } from "../api/apiConfig";

// Simple endpoint
const url = API_ENDPOINTS.MEDIA.GET_ALL;
// Result: "https://pm-backend-1-0s8f.onrender.com/api/media"

// Dynamic endpoint with ID
const url = API_ENDPOINTS.MEDIA.GET_ONE(mediaId);
// Result: "https://pm-backend-1-0s8f.onrender.com/api/media/:id"

// Use in axios
const response = await axios.get(API_ENDPOINTS.MEDIA.GET_ALL);
```

## 🛡️ Protected Routes Example

```javascript
// Admin only
<Route path="/admin/dashboard" 
  element={
    <ProtectedRoute requiredRole="admin">
      <AdminDash />
    </ProtectedRoute>
  } 
/>

// Photographer only
<Route path="/photographer/dashboard" 
  element={
    <ProtectedRoute requiredRole="photographer">
      <PhotographerDash />
    </ProtectedRoute>
  } 
/>

// Buyer only
<Route path="/buyer/dashboard" 
  element={
    <ProtectedRoute requiredRole="buyer">
      <BuyerDashboard />
    </ProtectedRoute>
  } 
/>
```

## 🧪 Testing an Endpoint

```bash
# Login first to get token
curl -X POST https://pm-backend-1-0s8f.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"123456"}'

# Use token in request
curl -X GET https://pm-backend-1-0s8f.onrender.com/api/payments/wallet/userId \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 📋 Endpoint Categories

### 🔐 Auth (7)
- POST `/auth/register`
- POST `/auth/login`
- GET `/auth/users`
- GET `/auth/users/:id`
- PUT `/auth/users/:id`
- DELETE `/auth/users/:id`
- PUT `/auth/photographers/:id/phone`

### 📸 Media (7)
- GET `/media`
- GET `/media/:id`
- GET `/media/:id/protected`
- POST `/media`
- PUT `/media/:id`
- PUT `/media/:id/price`
- DELETE `/media/:id`

### 💳 Payments (8)
- POST `/payments/mpesa`
- POST `/payments/callback`
- POST `/payments/buy`
- GET `/payments/purchase-history/:userId`
- GET `/payments/earnings/:photographerId`
- GET `/payments/earnings-summary/:photographerId`
- GET `/payments/admin/dashboard`

### 🛒 Cart (4)
- GET `/payments/cart/:userId`
- POST `/payments/cart/add`
- POST `/payments/cart/remove`
- DELETE `/payments/cart/:userId`

### 📄 Receipts (4)
- POST `/payments/receipt/create`
- GET `/payments/receipt/:receiptId`
- GET `/payments/receipts/:userId`
- GET `/payments/admin/receipts`

### 🔄 Refunds (6)
- POST `/payments/refund/request`
- GET `/payments/refunds/:userId`
- POST `/payments/refund/approve`
- POST `/payments/refund/reject`
- POST `/payments/refund/process`
- GET `/payments/admin/refunds`

### 💰 Wallet (3)
- GET `/payments/wallet/:userId`
- GET `/payments/transactions/:userId`
- POST `/payments/wallet/add`

## 🏃 Getting Started

```bash
# Backend
cd Backend
npm install
npm start  # Runs on localhost:4000

# Frontend (in new terminal)
cd frontend
npm install
npm start  # Runs on localhost:3000
```

## 📚 Documentation Files

- [SETUP_GUIDE.md](./SETUP_GUIDE.md) - Complete setup instructions
- [API_DOCUMENTATION.md](./Backend/API_DOCUMENTATION.md) - Full API reference
- [API_INTEGRATION_VERIFICATION.md](./API_INTEGRATION_VERIFICATION.md) - Verification checklist

## ⚡ Common Axios Calls

```javascript
// Login
axios.post(API_ENDPOINTS.AUTH.LOGIN, {
  email: "user@example.com",
  password: "password123"
});

// Get all media
axios.get(API_ENDPOINTS.MEDIA.GET_ALL);

// Get user's earnings
axios.get(
  API_ENDPOINTS.PAYMENTS.EARNINGS_SUMMARY(userId),
  { headers: { Authorization: `Bearer ${token}` } }
);

// Add to cart
axios.post(
  API_ENDPOINTS.CART.ADD,
  { userId, mediaId },
  { headers: { Authorization: `Bearer ${token}` } }
);
```

## 🔒 Role-Based Access

```
Admin Role       → /admin/* routes
Photographer Role → /photographer/* routes
Buyer Role       → /buyer/* routes
```

## 📲 Phone Number Format
```
Format: 254XXXXXXXXX
Example: 254712345678
Used for: M-Pesa payments
```

## 💵 Pricing 
```
Currency: KES (Kenyan Shilling)
Platform Fee: 10% admin cut
Photographer Cut: 90% of media price
```

## ✅ Status

- **39 Endpoints** ✅ Mapped
- **Protected Routes** ✅ Configured
- **API Config** ✅ Centralized
- **Documentation** ✅ Complete
- **Ready for Production** ✅

---

**Last Update**: February 26, 2026
**Backend URL**: https://pm-backend-1-0s8f.onrender.com/api
**Status**: 🟢 All Systems Go

# PhotoMarket - Backend & Frontend Setup Guide

## 🎯 Project Overview

PhotoMarket is a photo/media marketplace where:
- **Photographers** can upload and sell their media
- **Buyers** can purchase and download media
- **Admins** manage the platform

Backend URL: `https://pm-backend-1-0s8f.onrender.com/api`

---

## ✅ What's Been Fixed

### 1. **Backend Routes** - All Mapped ✅
- **Authentication**: Register, Login, User Management
- **Media**: CRUD operations, pricing, protected downloads
- **Payments**: M-Pesa integration, purchase tracking
- **Cart**: Add, remove, clear items
- **Receipts**: Create and retrieve receipts
- **Refunds**: Request, approve, reject, process refunds
- **Wallet**: Balance tracking, transaction history

### 2. **New Controllers Created** ✅
- `walletController.js` - Wallet operations
- All controllers have proper named exports

### 3. **Routes Updated** ✅
- `PayementRoutes.js` - Now includes **39 endpoints** across 7 categories

### 4. **Frontend API Configuration** ✅
- `src/api/apiConfig.js` - Centralized API endpoint definitions
- All URLs point to: `https://pm-backend-1-0s8f.onrender.com/api`

### 5. **Documentation** ✅
- `Backend/API_DOCUMENTATION.md` - Complete API reference

---

## 🚀 Quick Start

### Backend Setup

```bash
cd Backend

# Install dependencies
npm install

# Create .env file with:
PORT=4000
MONGODB_URI=<your_mongodb_uri>
JWT_SECRET=<your_secret>
MPESA_CONSUMER_KEY=<your_key>
MPESA_SECRET_KEY=<your_secret>
MPESA_SHORTCODE=174379
MPESA_PASSKEY=<your_passkey>
MPESA_ENVIRONMENT=sandbox
BASE_URL=https://pm-backend-1-0s8f.onrender.com

# Start server
npm start
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Create .env file with:
REACT_APP_API_URL=https://pm-backend-1-0s8f.onrender.com/api

# Start development server
npm start
```

---

## 📍 API Endpoints Reference

### Core Endpoints

**Auth**: 7 endpoints
```
POST   /auth/register
POST   /auth/login
GET    /auth/users
GET    /auth/users/:id
PUT    /auth/users/:id
DELETE /auth/users/:id
PUT    /auth/photographers/:id/phone
```

**Media**: 7 endpoints
```
GET    /media
GET    /media/:id
GET    /media/:id/protected
POST   /media
PUT    /media/:id
PUT    /media/:id/price
DELETE /media/:id
```

**Payments**: 8 endpoints
```
POST   /payments/mpesa
POST   /payments/callback
POST   /payments/buy
GET    /payments/purchase-history/:userId
GET    /payments/earnings/:photographerId
GET    /payments/earnings-summary/:photographerId
GET    /payments/admin/dashboard
```

**Cart**: 4 endpoints
```
GET    /payments/cart/:userId
POST   /payments/cart/add
POST   /payments/cart/remove
DELETE /payments/cart/:userId
```

**Receipts**: 4 endpoints
```
POST   /payments/receipt/create
GET    /payments/receipt/:receiptId
GET    /payments/receipts/:userId
GET    /payments/admin/receipts
```

**Refunds**: 6 endpoints
```
POST   /payments/refund/request
GET    /payments/refunds/:userId
POST   /payments/refund/approve
POST   /payments/refund/reject
POST   /payments/refund/process
GET    /payments/admin/refunds
```

**Wallet**: 3 endpoints
```
GET    /payments/wallet/:userId
GET    /payments/transactions/:userId
POST   /payments/wallet/add
```

**Total: 39 Endpoints** ✅

---

## 📁 File Structure

```
Backend/
├── controllers/
│   ├── authController.js       ✅
│   ├── mediaController.js      ✅
│   ├── paymentController.js    ✅
│   ├── cartController.js       ✅
│   ├── receiptController.js    ✅
│   ├── refundController.js     ✅
│   └── walletController.js     ✅ (NEW)
├── routes/
│   ├── authcontroller.js       ✅
│   ├── MediaRoutes.js          ✅
│   ├── PayementRoutes.js       ✅ (UPDATED)
│   └── Album.js                ✅
├── models/
│   ├── users.js
│   ├── media.js
│   ├── Payment.js
│   ├── Cart.js
│   ├── Receipt.js
│   └── Refund.js
├── middleware/
│   └── upload.js
├── server.js                   ✅
├── .env
├── package.json
├── API_DOCUMENTATION.md        ✅ (NEW)
└── ENDPOINTS.txt

frontend/
├── src/
│   ├── api/
│   │   └── apiConfig.js        ✅ (NEW)
│   ├── Components/
│   │   ├── ProtectedRoute.jsx  ✅ (NEW)
│   │   └── Pages/
│   │       ├── Login.jsx       ✅
│   │       ├── Register.jsx    ✅
│   │       ├── Admin/
│   │       ├── Photographer/
│   │       └── Buyer/
│   ├── App.js                  ✅ (UPDATED)
│   └── index.js
└── package.json
```

---

## 🔐 Authentication Flow

1. **User registers** → `POST /auth/register`
2. **User receives token** → Stored in `localStorage`
3. **Protected routes check** → `ProtectedRoute` component validates token & role
4. **Token sent with requests** → `Authorization: Bearer <token>` header
5. **Logout clears** → `localStorage.clear()`

---

## 🛡️ Protected Routes (Frontend)

All role-specific routes are now protected:

```javascript
// Admin Routes
<Route path="/admin/dashboard" 
  element={<ProtectedRoute requiredRole="admin">
    <AdminDash />
  </ProtectedRoute>} 
/>

// Photographer Routes
<Route path="/photographer/dashboard" 
  element={<ProtectedRoute requiredRole="photographer">
    <PhotographerDash />
  </ProtectedRoute>} 
/>

// Buyer Routes
<Route path="/buyer/dashboard" 
  element={<ProtectedRoute requiredRole="buyer">
    <BuyerDashboard />
  </ProtectedRoute>} 
/>
```

---

## 💡 How to Use API Config

**Before (scattered URLs):**
```javascript
const response = await axios.get(
  "https://pm-backend-1-0s8f.onrender.com/api/media"
);
```

**After (using config - RECOMMENDED):**
```javascript
import { API_ENDPOINTS } from "../api/apiConfig";

const response = await axios.get(API_ENDPOINTS.MEDIA.GET_ALL);
// or with ID:
const response = await axios.get(API_ENDPOINTS.MEDIA.GET_ONE(id));
```

---

## 🧪 Testing APIs

### Using cURL

```bash
# Test Auth Login
curl -X POST https://pm-backend-1-0s8f.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'

# Test Get All Media
curl https://pm-backend-1-0s8f.onrender.com/api/media

# Test Protected Endpoint
curl -X GET https://pm-backend-1-0s8f.onrender.com/api/payments/wallet/userId \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Using Postman

1. Create collection for PhotoMarket
2. Import endpoints from `API_DOCUMENTATION.md`
3. Set environment variable: `base_url` = `https://pm-backend-1-0s8f.onrender.com/api`
4. Add token to Authorization tab
5. Test each endpoint

---

## 🚨 Common Issues & Solutions

### Issue: "Route not found" (404)
**Solution**: Check that the route is properly imported in `PayementRoutes.js`

### Issue: "Cannot find module"
**Solution**: Make sure all controller exports use `export` keyword

### Issue: CORS error
**Solution**: Verify frontend URL is in backend's CORS whitelist in `server.js`

### Issue: Authentication fails
**Solution**: Ensure token is stored in `localStorage` with key `"token"`

---

## 📋 Checklist Before Deployment

- [ ] All 39 endpoints working locally
- [ ] Backend tests passing
- [ ] Frontend API calls use correct URLs
- [ ] Environment variables configured
- [ ] Protected routes protecting endpoints
- [ ] M-Pesa credentials configured (if using real payments)
- [ ] Database backups taken
- [ ] Error handling implemented
- [ ] Logging configured
- [ ] CORS settings reviewed

---

## 🔗 Important Links

- **Backend URL**: https://pm-backend-1-0s8f.onrender.com/api
- **API Docs**: [Backend/API_DOCUMENTATION.md](./Backend/API_DOCUMENTATION.md)
- **Frontend Config**: [src/api/apiConfig.js](./frontend/src/api/apiConfig.js)
- **Protected Routes**: [src/Components/ProtectedRoute.jsx](./frontend/src/Components/ProtectedRoute.jsx)

---

## 📞 Support

For issues or questions, refer to:
1. `API_DOCUMENTATION.md` - Complete API reference
2. Controller files - Implementation details
3. Route files - Endpoint mappings
4. Error logs - Backend console output

---

**Last Updated**: February 26, 2026
**Status**: ✅ All APIs Mapped and Ready

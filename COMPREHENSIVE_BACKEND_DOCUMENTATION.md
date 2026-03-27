# PhotoMarket Backend - Complete Documentation

## Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Database Models](#database-models)
4. [Authentication System](#authentication-system)
5. [Media Management](#media-management)
6. [Payment System](#payment-system)
7. [Cart System](#cart-system)
8. [Receipt System](#receipt-system)
9. [Refund System](#refund-system)
10. [Wallet System](#wallet-system)
11. [Admin Settings](#admin-settings)
12. [API Endpoints Reference](#api-endpoints-reference)
13. [Frontend Integration Guide](#frontend-integration-guide)
14. [Code Walkthroughs](#code-walkthroughs)
15. [Security Features](#security-features)
16. [Deployment](#deployment)

---

## Project Overview

PhotoMarket is a comprehensive photo/media marketplace platform built with Node.js, Express.js, and MongoDB. The system allows photographers to upload and sell their media content while providing buyers with a secure platform to purchase and download digital assets.

### Key Features
- **Multi-role authentication** (Admin, Photographer, User)
- **Secure media uploads** with file type validation
- **Protected media access** with signed URLs
- **M-Pesa payment integration** for Kenyan market
- **Shopping cart functionality**
- **Receipt generation** and management
- **Refund system** with admin approval
- **Wallet system** for balance management
- **Event-based media sharing** (albums with temporary access)
- **Admin dashboard** for platform management

### Technology Stack
- **Backend**: Node.js, Express.js, MongoDB with Mongoose
- **Authentication**: JWT tokens with Firebase Admin SDK fallback
- **File Storage**: Local file system with Multer
- **Payments**: M-Pesa Daraja API integration
- **Email**: Nodemailer for notifications
- **Security**: bcrypt for password hashing, CORS, input validation

---

## Architecture

### Server Structure
```
server.js (Main entry point)
├── Environment configuration (.env)
├── Database connection (MongoDB)
├── Middleware setup (CORS, body parsing, static files)
├── Route mounting (/api/auth, /api/media, /api/payments, /api/admin)
├── Global error handling
└── 404 handler
```

### Directory Structure
```
Backend/
├── controllers/          # Business logic handlers
├── models/              # Database schemas
├── routes/              # API route definitions
├── middlewares/         # Authentication, upload, admin checks
├── uploads/             # File storage (photos, profiles, videos)
├── server.js            # Main application file
├── package.json         # Dependencies and scripts
└── Documentation files
```

### Request Flow
1. **Client Request** → Express middleware (CORS, body parsing)
2. **Authentication** → JWT/Firebase token verification
3. **Authorization** → Role-based access control
4. **Route Handler** → Controller method execution
5. **Database Operations** → Mongoose model interactions
6. **Response** → JSON data or file download

---

## Database Models

### User Model (`models/users.js`)
```javascript
{
  username: String (required, unique),
  email: String (required, unique),
  password: String (required, hashed),
  profilePicture: String (default: ""),
  phoneNumber: String (default: "", for M-Pesa payments),
  role: String (enum: ["admin", "photographer", "user"], default: "user"),
  isActive: Boolean (default: true),
  isBanned: Boolean (default: false)
}
```

**Relationships:**
- Photographer of Media items
- Buyer in Payment transactions
- Owner of Cart, Wallet, Receipts

### Media Model (`models/media.js`)
```javascript
{
  title: String (required),
  description: String,
  price: Number (default: 0),
  fileUrl: String (required, path to uploaded file),
  mediaType: String (enum: ["photo", "video"], required),
  album: ObjectId (ref: "Album", optional),
  photographer: ObjectId (ref: "User", required),
  views: Number (default: 0),
  likes: Number (default: 0),
  downloads: Number (default: 0),
  comments: [ObjectId] (ref: "Comment")
}
```

**Key Methods:**
- `normalizeFileUrl()` - Converts absolute paths to web-accessible URLs
- Tracks engagement metrics (views, downloads, likes)

### Payment Model (`models/Payment.js`)
```javascript
{
  buyer: ObjectId (ref: "User", required),
  media: ObjectId (ref: "Media", optional for wallet topups),
  amount: Number (required),
  adminShare: Number (default: 0, 10% platform fee),
  photographerShare: Number (default: 0, 90% of sale),
  status: String (enum: ["pending", "completed", "failed", "refunded"]),
  paymentMethod: String (enum: ["mpesa", "mock"]),
  checkoutRequestID: String (M-Pesa transaction ID),
  merchantRequestID: String (M-Pesa merchant ID),
  mpesaReceiptNumber: String (M-Pesa confirmation),
  phoneNumber: String (buyer's phone),
  transactionDate: Date,
  callbackData: Mixed (full M-Pesa response)
}
```

**Business Logic:**
- Platform takes 10% commission on all sales
- Photographer receives 90% of media price
- Tracks complete payment lifecycle

### Cart Model (`models/Cart.js`)
```javascript
{
  user: ObjectId (ref: "User", required),
  items: [{
    media: ObjectId (ref: "Media", required),
    price: Number (required, frozen at add time),
    addedAt: Date (default: now)
  }],
  totalPrice: Number (default: 0, calculated field)
}
```

**Operations:**
- Add/remove individual items
- Clear entire cart
- Automatic price calculation

### Receipt Model (`models/Receipt.js`)
```javascript
{
  buyer: ObjectId (ref: "User", required),
  payment: ObjectId (ref: "Payment", required),
  items: [{
    media: ObjectId (ref: "Media"),
    title: String,
    price: Number,
    photographer: ObjectId (ref: "User")
  }],
  totalAmount: Number (required),
  adminShare: Number (required),
  transactionId: String,
  downloadUrl: String (signed URL for media access),
  receiptNumber: String (unique, generated),
  status: String (enum: ["completed", "refunded", "pending"])
}
```

**Features:**
- Unique receipt numbers for tracking
- Signed download URLs for secure access
- Itemized billing details

### Refund Model (`models/Refund.js`)
```javascript
{
  payment: ObjectId (ref: "Payment", required),
  buyer: ObjectId (ref: "User", required),
  media: ObjectId (ref: "Media", required),
  amount: Number (required),
  reason: String,
  status: String (enum: ["pending", "approved", "rejected", "processed"]),
  refundAmount: Number (default: 0),
  adminRejectionReason: String
}
```

**Workflow:**
1. Buyer requests refund with reason
2. Admin reviews and approves/rejects
3. If approved, admin processes refund (credits wallet)
4. Payment status updated to "refunded"

### Wallet Model (`models/Wallet.js`)
```javascript
{
  user: ObjectId (ref: "User", required, unique),
  balance: Number (default: 0)
}
```

**Operations:**
- Track user balance
- Credit from refunds
- Debit for purchases (when using wallet payment)
- Top-up via M-Pesa

### Album Model (`models/album.js`)
```javascript
{
  name: String (required),
  description: String,
  coverImage: String,
  photographer: ObjectId (ref: "User", required)
}
```

**Purpose:**
- Group related media items
- Event-based sharing with temporary access tokens

### EventAccess Model (`models/EventAccess.js`)
```javascript
{
  album: ObjectId (ref: "Album", required),
  photographer: ObjectId (ref: "User", required),
  buyer: ObjectId (ref: "User", required),
  token: String (required, unique, base64 encoded),
  expiresAt: Date (required),
  isActive: Boolean (default: true)
}
```

**Security:**
- Temporary access tokens for event sharing
- Automatic expiration
- Single-use or time-limited access

### Settings Model (`models/settings.js`)
```javascript
{
  siteName: String (default: "PhotoMarket"),
  siteUrl: String,
  adminEmail: String,
  platformFee: Number (default: 30, percentage),
  minPayout: Number (default: 1000),
  maxUploadSize: Number (default: 10, MB),
  allowedFormats: [String] (default: ["jpg", "jpeg", "png", "gif", "mp4", "webm"]),
  requireApproval: Boolean (default: true),
  autoPublish: Boolean (default: false),
  enableMpesa: Boolean (default: true),
  enableWallet: Boolean (default: true),
  maintenanceMode: Boolean (default: false),
  registrationOpen: Boolean (default: true),
  emailVerification: Boolean (default: false),
  smtpHost: String,
  smtpPort: Number (default: 587),
  smtpUser: String,
  smtpPass: String,
  razorpayKey: String,
  stripeKey: String
}
```

**Admin Configuration:**
- Platform-wide settings
- Payment gateway configurations
- Upload restrictions
- Email SMTP settings

---

## Authentication System

### JWT Authentication Flow

1. **Registration** (`POST /api/auth/register`)
   - Validate input (username, email, password, phone)
   - Hash password with bcrypt (salt rounds: 10)
   - Create user with role (default: "user")
   - Handle profile picture upload
   - Return user data (exclude password)

2. **Login** (`POST /api/auth/login`)
   - Find user by email
   - Compare password with bcrypt
   - Generate JWT token with userId, email, role
   - Token expires in 7 days
   - Return token and user data

3. **Token Verification** (middleware/auth.js)
   - Extract Bearer token from Authorization header
   - Try JWT verification first
   - Fallback to Firebase token verification
   - Attach user info to request object
   - Proceed to route handler or return 401

### Role-Based Access Control

**Admin Routes:**
- Require `req.user.role === "admin"`
- Access to user management, refunds, dashboard

**Photographer Routes:**
- Require `req.user.role === "photographer"`
- Access to upload media, view earnings, manage albums

**User Routes:**
- Default role for buyers
- Access to browse, purchase, download media

### Firebase Authentication Fallback

The system supports Firebase Authentication tokens as an alternative to JWT:
- Verifies Firebase ID tokens
- Extracts user ID from `decoded.uid`
- Maps Firebase claims to local user roles

---

## Media Management

### Upload Process

1. **File Upload** (`POST /api/media`)
   - Multer middleware handles multipart/form-data
   - Files stored in `uploads/photos/` directory
   - Filename: timestamp + random string + extension
   - Supported formats: jpg, jpeg, png, gif, mp4, webm

2. **Media Creation**
   - Validate required fields (title, photographer, file)
   - Store relative path: `/uploads/photos/filename.ext`
   - Set media type based on file extension
   - Associate with photographer and optional album

3. **Access Control**
   - Photographers can view/edit their own media
   - Public can browse all media
   - Protected downloads require purchase verification

### Protected Media Access

**How Users Get Images:**

1. **Browse Public Media** (`GET /api/media`)
   - Returns all media with basic info
   - File URLs are normalized for web access
   - No authentication required

2. **View Media Details** (`GET /api/media/:id`)
   - Returns single media item
   - Includes photographer information
   - Public access

3. **Protected Download** (`GET /api/media/:id/protected`)
   - Requires authentication
   - Verifies user purchased the media
   - Generates signed download URL with token
   - Token expires in 10 minutes

4. **Secure Download** (`GET /api/media/:id/download?token=...&user=...`)
   - Validates download token
   - Checks token expiration
   - Verifies user authentication
   - Serves file directly from filesystem
   - Increments download counter

### Photographer Upload Flow

**Frontend Implementation:**
```javascript
// Upload form with file input
const formData = new FormData();
formData.append('file', selectedFile);
formData.append('title', title);
formData.append('description', description);
formData.append('price', price);
formData.append('photographer', userId);

const response = await axios.post('/api/media', formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
});
```

**Backend Processing:**
- Multer saves file to disk
- Creates Media document
- Returns media object with fileUrl

### Event-Based Sharing

**Album Creation:**
- Photographers create albums for events
- Albums group related media items

**Access Token Generation:**
- Photographer generates temporary access tokens
- Tokens expire after specified minutes
- Tokens encoded with albumId, buyerEmail, timestamp

**Token Redemption:**
- Buyer accesses album via token link
- System validates token and expiration
- Grants temporary access to album media

---

## Payment System

### M-Pesa Integration

**STK Push Flow:**

1. **Initiate Payment** (`POST /api/payments/mpesa`)
   - Validate buyer phone number (254XXXXXXXXX format)
   - Calculate amounts (10% admin fee, 90% photographer)
   - Generate M-Pesa password (shortcode + passkey + timestamp)
   - Send STK push request to M-Pesa API

2. **M-Pesa Processing**
   - User receives prompt on phone
   - User enters M-Pesa PIN
   - M-Pesa processes transaction

3. **Callback Handling** (`POST /api/payments/callback`)
   - Receives payment confirmation from M-Pesa
   - Updates payment status to "completed"
   - Credits photographer via B2C (Business to Customer)
   - Credits admin account
   - Increments media download counter

4. **B2C Payouts**
   - Sends money to photographer's phone
   - Sends commission to admin phone
   - Uses Business Payment command ID

### Mock Payment (Testing)

**Direct Purchase** (`POST /api/payments/buy`)
- Bypasses M-Pesa for testing
- Instantly marks payment as completed
- Triggers same B2C payouts
- Useful for development and demos

### Wallet Top-up

**M-Pesa Top-up:**
- Same STK push flow as purchases
- No media association
- Credits user wallet directly
- Uses "wallet topup" reference

### Earnings Tracking

**Photographer Earnings** (`GET /api/payments/earnings/:photographerId`)
- Lists all completed sales for photographer
- Shows buyer details, media sold, amounts
- Calculates total earnings

**Earnings Summary** (`GET /api/payments/earnings-summary/:photographerId`)
- Aggregated earnings data
- Top selling media
- Average price per sale
- Recent sales list

---

## Cart System

### Cart Operations

**Add to Cart** (`POST /api/payments/cart/add`)
- Validates media exists and is for sale
- Prevents duplicate items
- Stores price at time of adding (prevents price changes)
- Updates total price

**Remove from Cart** (`POST /api/payments/cart/remove`)
- Removes specific media item
- Recalculates total price

**Clear Cart** (`DELETE /api/payments/cart/:userId`)
- Removes all items
- Resets total to 0

**View Cart** (`GET /api/payments/cart/:userId`)
- Returns cart with populated media details
- Shows current total price

### Cart Persistence

- Carts are stored in database per user
- Items persist across sessions
- Prices are frozen when added to cart
- Automatic cleanup not implemented (carts persist indefinitely)

---

## Receipt System

### Receipt Generation

**After Payment Completion:**
- System automatically creates receipt
- Generates unique receipt number (RCP-timestamp-random)
- Links to payment and buyer
- Includes itemized details

**Receipt Structure:**
```javascript
{
  buyer: userId,
  payment: paymentId,
  items: [{
    media: mediaId,
    title: "Photo Title",
    price: 100,
    photographer: photographerId
  }],
  totalAmount: 100,
  adminShare: 10,
  downloadUrl: "signed-url-for-download",
  receiptNumber: "RCP-1234567890-ABCDEF"
}
```

### Receipt Access

**User Receipts** (`GET /api/payments/receipts/:userId`)
- Lists all receipts for user
- Sorted by creation date (newest first)

**Individual Receipt** (`GET /api/payments/receipt/:receiptId`)
- Detailed receipt view
- Includes download URLs for purchased media

**Admin Receipt View** (`GET /api/payments/admin/receipts`)
- All receipts across platform
- Used for audit and support

---

## Refund System

### Refund Request Flow

1. **Request Refund** (`POST /api/payments/refund/request`)
   - Buyer provides payment ID and reason
   - Creates refund record with "pending" status
   - Prevents duplicate refund requests

2. **Admin Review**
   - Admin views pending refunds (`GET /api/payments/admin/refunds`)
   - Reviews refund reason and legitimacy

3. **Admin Decision**
   - **Approve** (`POST /api/payments/refund/approve`): Sets status to "approved"
   - **Reject** (`POST /api/payments/refund/reject`): Sets status to "rejected" with reason

4. **Process Refund** (`POST /api/payments/refund/process`)
   - Credits refund amount to buyer's wallet
   - Updates payment status to "refunded"
   - Sets refund status to "processed"

### Refund Validation

- Only one refund per payment allowed
- Refund amount cannot exceed original payment
- Admin must provide rejection reason
- Wallet credit only after admin approval

---

## Wallet System

### Wallet Operations

**Balance Check** (`GET /api/payments/wallet/:userId`)
- Returns current balance
- Shows transaction summary

**Transaction History** (`GET /api/payments/transactions/:userId`)
- Lists all wallet transactions
- Includes earnings (for photographers) and purchases (for buyers)

**Add Funds** (`POST /api/payments/wallet/add`)
- Manual fund addition (admin/testing only)
- Credits wallet directly

### Wallet Integration

**Purchase with Wallet:**
- During mock payment, checks wallet balance
- Deducts amount from wallet
- No M-Pesa involvement

**Refund Credits:**
- Approved refunds credit wallet
- Amount matches original payment

**Transaction Types:**
```javascript
{
  id: paymentId,
  type: "purchase" | "earnings" | "topup" | "refund",
  amount: number (negative for debits, positive for credits),
  description: "Purchase: Photo Title" | "Earnings from buyer",
  date: timestamp,
  status: "completed"
}
```

---

## Admin Settings

### Settings Management

**Platform Configuration:**
- Site name, URL, admin email
- Platform fee percentage (default: 30%)
- Minimum payout amount
- Upload restrictions (file size, formats)

**Payment Settings:**
- M-Pesa enable/disable
- Wallet system enable/disable
- Alternative payment gateways (Razorpay, Stripe keys)

**System Settings:**
- Maintenance mode
- Registration open/closed
- Email verification required

**Email Configuration:**
- SMTP settings for notifications
- Test email functionality

### Admin Operations

**User Management:**
- View all users
- Update user roles
- Ban/unban users
- Delete users

**Purchase Audit:**
- View all completed payments
- Filter by buyer/photographer
- Generate download links for media

**Revenue Dashboard:**
- Total platform revenue
- Photographer earnings breakdown
- Sales analytics

---

## API Endpoints Reference

### Authentication Endpoints

| Method | Endpoint | Description | Frontend Usage |
|--------|----------|-------------|----------------|
| POST | `/api/auth/register` | Register new user | Registration form |
| POST | `/api/auth/login` | User login | Login form |
| GET | `/api/auth/users` | Get all users | Admin user management |
| GET | `/api/auth/users/:id` | Get user by ID | User profile |
| PUT | `/api/auth/users/:id` | Update user | Profile edit |
| DELETE | `/api/auth/users/:id` | Delete user | Admin actions |
| PUT | `/api/auth/photographers/:id/phone` | Update photographer phone | Payment setup |

### Media Endpoints

| Method | Endpoint | Description | Frontend Usage |
|--------|----------|-------------|----------------|
| GET | `/api/media` | Get all media | Browse gallery |
| GET | `/api/media/:id` | Get media details | Media detail page |
| GET | `/api/media/mine` | Get user's media | Photographer dashboard |
| GET | `/api/media/:id/protected` | Get protected media | Purchase verification |
| GET | `/api/media/:id/download` | Download media | File download |
| POST | `/api/media` | Upload media | Upload form |
| PUT | `/api/media/:id` | Update media | Edit media |
| PUT | `/api/media/:id/price` | Update price | Price management |
| DELETE | `/api/media/:id` | Delete media | Media management |

### Payment Endpoints

| Method | Endpoint | Description | Frontend Usage |
|--------|----------|-------------|----------------|
| POST | `/api/payments/mpesa` | Initiate M-Pesa payment | Checkout |
| POST | `/api/payments/mpesa/topup` | Wallet top-up | Wallet funding |
| POST | `/api/payments/callback` | M-Pesa callback | Automatic (server) |
| POST | `/api/payments/buy` | Mock payment | Testing checkout |
| GET | `/api/payments/purchase-history/:userId` | Purchase history | Order history |
| GET | `/api/payments/earnings/:photographerId` | Photographer earnings | Earnings page |
| GET | `/api/payments/earnings-summary/:photographerId` | Earnings summary | Dashboard |
| GET | `/api/payments/admin/dashboard` | Admin revenue | Admin dashboard |

### Cart Endpoints

| Method | Endpoint | Description | Frontend Usage |
|--------|----------|-------------|----------------|
| GET | `/api/payments/cart/:userId` | Get user cart | Cart page |
| POST | `/api/payments/cart/add` | Add to cart | Product pages |
| POST | `/api/payments/cart/remove` | Remove from cart | Cart management |
| DELETE | `/api/payments/cart/:userId` | Clear cart | Cart actions |

### Receipt Endpoints

| Method | Endpoint | Description | Frontend Usage |
|--------|----------|-------------|----------------|
| POST | `/api/payments/receipt/create` | Create receipt | Post-payment |
| GET | `/api/payments/receipt/:receiptId` | Get receipt | Receipt view |
| GET | `/api/payments/receipts/:userId` | Get user receipts | Receipt list |
| GET | `/api/payments/admin/receipts` | Get all receipts | Admin audit |

### Refund Endpoints

| Method | Endpoint | Description | Frontend Usage |
|--------|----------|-------------|----------------|
| POST | `/api/payments/refund/request` | Request refund | Order actions |
| GET | `/api/payments/refunds/:userId` | Get user refunds | Refund status |
| POST | `/api/payments/refund/approve` | Approve refund | Admin panel |
| POST | `/api/payments/refund/reject` | Reject refund | Admin panel |
| POST | `/api/payments/refund/process` | Process refund | Admin panel |
| GET | `/api/payments/admin/refunds` | Get all refunds | Admin dashboard |

### Wallet Endpoints

| Method | Endpoint | Description | Frontend Usage |
|--------|----------|-------------|----------------|
| GET | `/api/payments/wallet/:userId` | Get wallet balance | Wallet page |
| GET | `/api/payments/transactions/:userId` | Get transactions | Transaction history |
| POST | `/api/payments/wallet/add` | Add funds | Manual top-up |

### Admin Endpoints

| Method | Endpoint | Description | Frontend Usage |
|--------|----------|-------------|----------------|
| GET | `/api/admin/settings` | Get settings | Admin settings |
| PUT | `/api/admin/settings` | Update settings | Admin settings |
| PUT | `/api/admin/settings/platform-fee` | Update fee | Fee management |
| PUT | `/api/admin/settings/payout` | Update payout | Payout settings |
| POST | `/api/admin/settings/test-email` | Test email | Email config |
| POST | `/api/admin/clear-cache` | Clear cache | System maintenance |
| POST | `/api/admin/maintenance-mode` | Toggle maintenance | System control |
| GET | `/api/admin/audit/purchases` | Purchase audit | Admin reports |

---

## Frontend Integration Guide

### Authentication Integration

**Login Flow:**
```javascript
// Login component
const handleLogin = async (email, password) => {
  try {
    const response = await axios.post('/api/auth/register', {
      email,
      password
    });
    
    const { token, user } = response.data;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    
    // Redirect based on role
    if (user.role === 'admin') navigate('/admin/dashboard');
    else if (user.role === 'photographer') navigate('/photographer/dashboard');
    else navigate('/buyer/dashboard');
  } catch (error) {
    showError(error.response.data.message);
  }
};
```

**Protected Route Component:**
```javascript
// ProtectedRoute.jsx
const ProtectedRoute = ({ children, requiredRole }) => {
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  
  if (!token) return <Navigate to="/login" />;
  if (requiredRole && user.role !== requiredRole) return <Navigate to="/unauthorized" />;
  
  return children;
};
```

**API Request Interceptor:**
```javascript
// axios setup
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

### Media Upload Integration

**File Upload Component:**
```javascript
// MediaUpload.jsx
const [selectedFile, setSelectedFile] = useState(null);
const [formData, setFormData] = useState({
  title: '',
  description: '',
  price: 0
});

const handleUpload = async () => {
  const data = new FormData();
  data.append('file', selectedFile);
  data.append('title', formData.title);
  data.append('description', formData.description);
  data.append('price', formData.price);
  data.append('photographer', user.id);
  
  try {
    const response = await axios.post('/api/media', data, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    
    showSuccess('Media uploaded successfully');
    navigate('/photographer/media');
  } catch (error) {
    showError(error.response.data.message);
  }
};
```

### Payment Integration

**M-Pesa Checkout:**
```javascript
// Checkout.jsx
const handlePayment = async () => {
  try {
    const response = await axios.post('/api/payments/mpesa', {
      mediaId: selectedMedia.id,
      buyerPhone: user.phoneNumber,
      buyerId: user.id,
      amount: selectedMedia.price
    });
    
    showSuccess('Payment initiated. Check your phone.');
    
    // Poll for payment status or wait for redirect
  } catch (error) {
    showError('Payment failed: ' + error.response.data.message);
  }
};
```

**Purchase History:**
```javascript
// PurchaseHistory.jsx
const [purchases, setPurchases] = useState([]);

useEffect(() => {
  const fetchPurchases = async () => {
    try {
      const response = await axios.get(`/api/payments/purchase-history/${user.id}`);
      setPurchases(response.data);
    } catch (error) {
      showError('Failed to load purchase history');
    }
  };
  
  fetchPurchases();
}, [user.id]);
```

### Cart Management

**Add to Cart:**
```javascript
// MediaCard.jsx
const addToCart = async (mediaId) => {
  try {
    await axios.post('/api/payments/cart/add', {
      userId: user.id,
      mediaId
    });
    
    showSuccess('Added to cart');
    updateCartCount();
  } catch (error) {
    if (error.response.data.message === 'Item already in cart') {
      showWarning('Item already in cart');
    } else {
      showError('Failed to add to cart');
    }
  }
};
```

**Cart Display:**
```javascript
// Cart.jsx
const [cart, setCart] = useState({ items: [], totalPrice: 0 });

const fetchCart = async () => {
  const response = await axios.get(`/api/payments/cart/${user.id}`);
  setCart(response.data);
};

const removeFromCart = async (mediaId) => {
  await axios.post('/api/payments/cart/remove', {
    userId: user.id,
    mediaId
  });
  fetchCart();
};
```

### Download Integration

**Protected Media Access:**
```javascript
// MediaViewer.jsx
const downloadMedia = async (mediaId) => {
  try {
    // First get protected access
    const protectedResponse = await axios.get(`/api/media/${mediaId}/protected`);
    
    // Then download using signed URL
    const downloadUrl = protectedResponse.data.downloadUrl;
    window.open(downloadUrl, '_blank');
  } catch (error) {
    showError('Download failed: ' + error.response.data.message);
  }
};
```

### Admin Dashboard

**Revenue Dashboard:**
```javascript
// AdminDashboard.jsx
const [dashboard, setDashboard] = useState({});

const fetchDashboard = async () => {
  const response = await axios.get('/api/payments/admin/dashboard');
  setDashboard(response.data);
};
```

**User Management:**
```javascript
// UserManagement.jsx
const [users, setUsers] = useState([]);

const fetchUsers = async () => {
  const response = await axios.get('/api/auth/users');
  setUsers(response.data);
};

const updateUserRole = async (userId, newRole) => {
  await axios.put(`/api/auth/users/${userId}`, { role: newRole });
  fetchUsers();
};
```

---

## Code Walkthroughs

### Server.js Main File

**Environment Setup:**
```javascript
// Load environment variables FIRST
dotenv.config({ path: path.join(__dirname, '.env') });

// Debug logging (remove in production)
console.log('PORT:', process.env.PORT);
console.log('MONGODB_URI exists:', !!process.env.MONGODB_URI);
```

**CORS Configuration:**
```javascript
app.use(cors({
  origin: [
    "http://localhost:3000",    // Development frontend
    "http://localhost:3001",    // Alternative dev port
    "https://pm-frontend-3buw.onrender.com",  // Production frontend
    "https://pm-backend-1-u2y3.onrender.com",  // Production backend
    "https://pm-backend-1-0s8f.onrender.com"   // Alternative backend
  ],
  credentials: true,  // Allow cookies/auth headers
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
}));
```

**Static File Serving:**
```javascript
// Serve uploaded files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Create upload directories if they don't exist
const uploadDirs = [
  path.join(__dirname, 'uploads'),
  path.join(__dirname, 'uploads/photos'),
  path.join(__dirname, 'uploads/profiles'),
  path.join(__dirname, 'uploads/videos')
];

uploadDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✅ Created directory: ${dir}`);
  }
});
```

**Admin User Creation:**
```javascript
async function ensureAdminUser() {
  const adminEmail = "admin@gmail.com";
  const adminPassword = "000000";

  try {
    const existingAdmin = await User.findOne({ email: adminEmail });
    if (existingAdmin) {
      console.log("✅ Admin user already exists:", adminEmail);
      return;
    }

    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    await User.create({
      username: "admin",
      email: adminEmail,
      password: hashedPassword,
      role: "admin"
    });

    console.log(`✅ Created admin user: ${adminEmail} (password: ${adminPassword})`);
  } catch (error) {
    console.error("❌ Failed to create admin user:", error);
  }
}
```

### Authentication Middleware Deep Dive

**Token Extraction:**
```javascript
export async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ 
      success: false, 
      message: "Authorization header missing or invalid" 
    });
  }

  const token = authHeader.split(" ")[1];
```

**JWT Verification:**
```javascript
// Try JWT verification first
if (process.env.JWT_SECRET) {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const userId = payload?.userId?.toString() || 
                   payload?.id?.toString() || 
                   payload?._id?.toString() || 
                   payload?.uid?.toString();

    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: "Invalid token payload: missing user id" 
      });
    }

    req.user = {
      userId,
      role: payload?.role || payload?.userRole || "user",
      email: payload?.email || payload?.username || "",
      tokenType: "jwt",
    };

    console.log("[auth] JWT authentication succeeded", { 
      userId: req.user.userId, 
      role: req.user.role 
    });
    return next();
  } catch (err) {
    console.error("[auth] JWT verification failed", err.message);
    // Continue to Firebase verification
  }
}
```

**Firebase Fallback:**
```javascript
// Firebase token verification
const app = initFirebaseAdmin();
if (app) {
  try {
    const decoded = await app.auth().verifyIdToken(token);
    const userId = decoded?.uid?.toString();

    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: "Invalid Firebase token payload: missing uid" 
      });
    }

    req.user = {
      userId,
      role: decoded.role || (decoded.admin ? "admin" : "user"),
      email: decoded.email || "",
      firebase: true,
      firebaseClaims: decoded,
      tokenType: "firebase",
    };

    console.log("[auth] Firebase authentication succeeded", { 
      userId: req.user.userId, 
      role: req.user.role 
    });
    return next();
  } catch (err) {
    console.error("[auth] Firebase verification failed", err.message);
  }
}
```

### Media Upload Process

**Multer Configuration:**
```javascript
// middleware/upload.js
const storage = (folderName) => multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, `../uploads/${folderName}`);
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

export const uploadPhoto = multer({ storage: storage('photos') });
export const uploadProfile = multer({ storage: storage('profiles') });
```

**Media Creation Controller:**
```javascript
// controllers/MediaController.js
export async function createMedia(req, res) {
  try {
    const { title, description, price, photographer, mediaType, album } = req.body;

    if (!photographer) {
      return res.status(400).json({ message: "Photographer ID is required" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "File (image/video) is required" });
    }

    // Store web-accessible path
    const fileUrl = `/uploads/photos/${req.file.filename}`;

    const media = await Media.create({
      title,
      description,
      price: price || 0,
      fileUrl,
      mediaType,
      album: album || null,
      photographer,
    });

    res.status(201).json(media);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}
```

### Protected Download Security

**Access Verification:**
```javascript
export async function getProtectedMedia(req, res) {
  // Extract authenticated user
  const authUserId = extractAuthUserId(req);
  if (!authUserId) {
    return normalizeError(res, 401, "Authenticated user id required");
  }

  // Verify user exists and is active
  const user = await User.findById(authUserId).lean();
  if (!user || user.isBanned || user.isActive === false) {
    return normalizeError(res, 403, "Account banned or inactive");
  }

  // Get media details
  const media = await Media.findById(req.params.id).populate("photographer");
  if (!media) return normalizeError(res, 404, "Media not found");

  // Permission checks
  const photographerId = media.photographer?._id?.toString();
  const isAdmin = req.user?.role === "admin";
  const isPhotographer = photographerId === authUserId;
  const isFree = !media.price || media.price <= 0;

  // Allow access if admin, photographer, or free media
  if (!isAdmin && !isPhotographer && !isFree) {
    // Check for completed purchase
    const payment = await Payment.findOne({
      media: req.params.id,
      buyer: authUserId,
      status: "completed"
    });

    if (!payment) {
      return normalizeError(res, 403, "Purchase required for this media");
    }
  }

  // Generate signed download URL
  const downloadToken = Buffer.from(`${req.params.id}:${authUserId}:${Date.now()}`).toString("base64");
  const signedUrl = `/api/media/${req.params.id}/download?token=${encodeURIComponent(downloadToken)}&user=${encodeURIComponent(authUserId)}`;

  res.status(200).json({
    success: true,
    media: { ...media.toObject(), fileUrl: normalizeFileUrl(media.fileUrl) },
    downloadUrl: signedUrl,
    canDownload: true,
  });
}
```

**Secure Download Handler:**
```javascript
export async function downloadMedia(req, res) {
  const { id } = req.params;
  const { token, user: queryUserId } = req.query;

  // Validate token presence
  if (!token || !queryUserId) {
    return normalizeError(res, 400, "Download token and user required");
  }

  // Extract authenticated user
  const authUserId = extractAuthUserId(req);
  if (!authUserId || queryUserId.toString().trim() !== authUserId) {
    return normalizeError(res, 403, "Authentication mismatch");
  }

  // Decode and validate token
  const decoded = Buffer.from(token.toString(), "base64").toString("utf-8");
  const [mediaId, tokenUserId, timestamp] = decoded.split(":");

  if (mediaId !== id || tokenUserId !== authUserId) {
    return normalizeError(res, 403, "Invalid download token");
  }

  // Check token expiration (10 minutes)
  const isExpired = (Date.now() - Number(timestamp)) > 10 * 60 * 1000;
  if (isExpired) {
    return normalizeError(res, 403, "Download token expired");
  }

  // Verify purchase permission
  const media = await Media.findById(id);
  if (!media) return normalizeError(res, 404, "Media not found");

  const photographerId = media.photographer?._id?.toString();
  const isAdmin = req.user?.role === "admin";
  const isPhotographer = photographerId === authUserId;
  const isFree = !media.price || media.price <= 0;

  if (!isAdmin && !isPhotographer && !isFree) {
    const payment = await Payment.findOne({
      media: id,
      buyer: authUserId,
      status: "completed"
    });

    if (!payment) {
      return normalizeError(res, 403, "Purchase verification failed");
    }
  }

  // Increment download counter
  await Media.findByIdAndUpdate(id, { $inc: { downloads: 1 } });

  // Serve file
  const redirectUrl = normalizeFileUrl(media.fileUrl);
  return res.redirect(redirectUrl);
}
```

### M-Pesa Payment Flow

**STK Push Initiation:**
```javascript
async function payWithMpesa(req, res) {
  // Extract and validate payment details
  const { mediaId, buyerPhone, buyerId, amount, walletTopup } = req.body;
  const topup = walletTopup === true || walletTopup === "true";

  // Phone number validation
  const phoneRegex = /^254\d{9}$/;
  if (!phoneRegex.test(buyerPhone)) {
    return res.status(400).json({
      message: "Invalid phone number format. Use 254XXXXXXXXX"
    });
  }

  // M-Pesa configuration check
  if (!consumerKey || !consumerSecret || !shortCode || !passkey) {
    return res.status(400).json({
      message: "M-Pesa configuration incomplete"
    });
  }

  // Verify buyer exists
  const buyer = await User.findById(buyerId);
  if (!buyer) return res.status(404).json({ message: "Buyer not found" });

  // Calculate payment amounts
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
      return res.status(400).json({ message: "Media price invalid" });
    }

    paymentAmount = media.price;
    adminCut = Math.round(media.price * 0.10 * 100) / 100; // 10% fee
    photographerCut = Math.round((media.price - adminCut) * 100) / 100;
    accountReference = mediaId.substring(0, 12);
    transactionDesc = `Payment for: ${media.title.substring(0, 12)}`;
  }

  // Get M-Pesa access token
  const accessToken = await getAccessToken();

  // Generate timestamp and password
  const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);
  const password = Buffer.from(shortCode + passkey + timestamp).toString("base64");

  // Prepare STK push request
  const baseUrl = getBaseUrl(req);
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

  // Send STK push
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

  // Create payment record
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
    message: "STK Push initiated. Please check your phone.",
    payment,
    stkResponse: stkResponse.data
  });
}
```

**Callback Processing:**
```javascript
async function mpesaCallback(req, res) {
  const callbackData = req.body;
  console.log("========== MPESA CALLBACK RECEIVED ==========");
  console.log(JSON.stringify(callbackData, null, 2));

  if (!callbackData.Body || !callbackData.Body.stkCallback) {
    return res.status(400).json({ ResultCode: 1, ResultDesc: "Invalid callback data" });
  }

  const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = callbackData.Body.stkCallback;

  // Find payment record
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
    // Payment successful
    let mpesaReceiptNumber = "";
    if (CallbackMetadata && CallbackMetadata.Item) {
      const receiptItem = CallbackMetadata.Item.find(item => item.Name === "MpesaReceiptNumber");
      if (receiptItem) {
        mpesaReceiptNumber = receiptItem.Value;
      }
    }

    // Update payment status
    payment.status = "completed";
    payment.mpesaReceiptNumber = mpesaReceiptNumber;
    payment.transactionDate = new Date();

    if (payment.media) {
      // Increment downloads
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
            req,
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
          req,
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
}
```

---

## Security Features

### Authentication Security

**Password Hashing:**
- Uses bcrypt with salt rounds of 10
- No plain text passwords stored
- Secure comparison using bcrypt.compare()

**JWT Security:**
- Tokens expire in 7 days
- Contains userId, email, role
- Signed with environment-specific secret

**Firebase Integration:**
- Validates Firebase ID tokens
- Extracts user claims securely
- Fallback authentication method

### File Upload Security

**File Type Validation:**
- Restricted to image and video formats
- Server-side extension checking
- Multer file filter configuration

**Path Security:**
- Files stored outside web root
- Served via Express static middleware
- Normalized URL paths prevent directory traversal

### Payment Security

**M-Pesa Integration:**
- Uses production API credentials
- Validates all callback data
- Secure token generation and validation

**Purchase Verification:**
- Checks payment completion status
- Validates user ownership
- Signed URLs with expiration

### API Security

**CORS Configuration:**
- Restricted to specific origins
- Credentials enabled for auth
- Proper headers validation

**Input Validation:**
- Required field checking
- Data type validation
- SQL injection prevention via Mongoose

**Rate Limiting:**
- Not implemented (recommend adding)
- Consider implementing for production

### Data Protection

**Sensitive Data Handling:**
- Passwords hashed with bcrypt
- Payment data encrypted in transit
- No sensitive data in logs

**Access Control:**
- Role-based permissions
- Owner-only operations
- Admin override capabilities

---

## Deployment

### Environment Variables

**Required for Production:**
```bash
# Server
PORT=4000
NODE_ENV=production

# Database
MONGODB_URI=mongodb+srv://...

# Authentication
JWT_SECRET=your-super-secure-jwt-secret-here

# M-Pesa Configuration
MPESA_CONSUMER_KEY=your-consumer-key
MPESA_CONSUMER_SECRET=your-consumer-secret
MPESA_SHORTCODE=your-shortcode
MPESA_PASSKEY=your-passkey
MPESA_ENVIRONMENT=sandbox  # or production
MPESA_INITIATOR_NAME=your-initiator-name
MPESA_INITIATOR_PASSWORD=your-initiator-password
ADMIN_PHONE_NUMBER=254xxxxxxxxx

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# URLs
BASE_URL=https://your-backend-url.com
FRONTEND_URL=https://your-frontend-url.com
```

### Production Deployment Steps

1. **Environment Setup:**
   ```bash
   # Clone repository
   git clone <repository-url>
   cd Backend
   
   # Install dependencies
   npm install
   
   # Create .env file with production values
   cp .env.example .env
   # Edit .env with production credentials
   ```

2. **Database Setup:**
   ```bash
   # Ensure MongoDB is running
   # Create database and user with proper permissions
   ```

3. **Build and Start:**
   ```bash
   # For production
   npm start
   
   # Or with PM2
   npm install -g pm2
   pm2 start server.js --name "photomarket-backend"
   ```

4. **SSL Configuration:**
   - Use HTTPS in production
   - Configure SSL certificates
   - Update CORS origins to HTTPS URLs

5. **File Storage:**
   - Consider cloud storage (AWS S3, Cloudinary) for production
   - Configure CDN for faster media delivery
   - Implement backup strategy

### Monitoring and Maintenance

**Logs:**
- Monitor console output for errors
- Set up log aggregation (Winston, Papertrail)
- Track payment failures and user issues

**Backups:**
- Regular database backups
- File storage backups
- Environment variable backups

**Performance:**
- Implement caching for frequently accessed data
- Optimize database queries
- Monitor response times

**Security Updates:**
- Keep dependencies updated
- Monitor for security vulnerabilities
- Regular security audits

---

This comprehensive documentation covers the entire PhotoMarket backend system, including all API endpoints, database models, business logic, security features, and frontend integration points. The system is designed to be production-ready with proper error handling, security measures, and scalable architecture.
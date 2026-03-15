# Backend Admin Settings API (PhotoMarket)

This document describes the *actual* backend API that the frontend `AdminSettings` UI can call.

All routes are mounted under:

```
/api/admin
```

All endpoints require:
- A valid JWT via `Authorization: Bearer <token>`
- The user must have `role: "admin"` (admins only)

Responses are JSON. HTTP status codes are used as follows:
- `200` success
- `400` bad request / validation failure
- `401` missing/invalid token
- `403` authenticated but not admin
- `500` server error

---

## 1) GET `/api/admin/settings`

### Purpose
Return the current system configuration values.

### Response (200)
```json
{
  "siteName": "PhotoMarket",
  "siteUrl": "https://pm-frontend-3buw.onrender.com",
  "adminEmail": "admin@example.com",
  "platformFee": 30,
  "minPayout": 1000,
  "maxUploadSize": 10,
  "allowedFormats": ["jpg", "jpeg", "png", "gif", "mp4", "webm"],
  "requireApproval": true,
  "autoPublish": false,
  "enableMpesa": true,
  "enableWallet": true,
  "maintenanceMode": false,
  "registrationOpen": true,
  "emailVerification": false,
  "smtpHost": "smtp.example.com",
  "smtpPort": 587,
  "smtpUser": "user@example.com",
  "smtpPass": "password",
  "razorpayKey": "rzp_test_xxx",
  "stripeKey": "sk_test_xxx"
}
```

> The backend stores these values in a MongoDB `Settings` document. Missing values will use defaults.

---

## 2) PUT `/api/admin/settings`

### Purpose
Update multiple settings in one request.

### Request Body (example)
```json
{
  "siteName": "PhotoMarket",
  "siteUrl": "https://pm-frontend-3buw.onrender.com",
  "adminEmail": "admin@example.com",
  "platformFee": 30,
  "minPayout": 1000,
  "maxUploadSize": 10,
  "allowedFormats": ["jpg", "jpeg", "png", "gif", "mp4", "webm"],
  "requireApproval": true,
  "autoPublish": false,
  "enableMpesa": true,
  "enableWallet": true,
  "maintenanceMode": false,
  "registrationOpen": true,
  "emailVerification": false,
  "smtpHost": "smtp.example.com",
  "smtpPort": 587,
  "smtpUser": "user@example.com",
  "smtpPass": "password",
  "razorpayKey": "rzp_test_xxx",
  "stripeKey": "sk_test_xxx"
}
```

### Response (200)
```json
{
  "success": true,
  "settings": { /* updated settings object */ }
}
```

> Only the fields in the allowed list are applied. Others are ignored.

---

## 3) PUT `/api/admin/settings/platform-fee`

### Purpose
Update the platform fee percentage.

### Request Body
```json
{ "fee": 30 }
```

### Response (200)
```json
{ "success": true, "platformFee": 30 }
```

---

## 4) PUT `/api/admin/settings/payout`

### Purpose
Update the minimum payout amount.

### Request Body
```json
{ "minPayout": 1000 }
```

### Response (200)
```json
{ "success": true, "minPayout": 1000 }
```

---

## 5) POST `/api/admin/settings/test-email`

### Purpose
Send a test email using the provided SMTP settings to verify email configuration.

### Request Body
```json
{
  "to": "admin@example.com",
  "smtpHost": "smtp.example.com",
  "smtpPort": 587,
  "smtpUser": "user@example.com",
  "smtpPass": "password"
}
```

### Response (200)
```json
{ "success": true, "message": "Test email sent" }
```

---

## 6) POST `/api/admin/clear-cache`

### Purpose
Clear the backend in-memory settings cache (forces a reload from the DB on next request).

### Request Body
Empty object `{}` or no body.

### Response (200)
```json
{ "success": true }
```

---

## 7) POST `/api/admin/maintenance-mode`

### Purpose
Enable/disable maintenance mode (the frontend can use this to block non-admin access).

### Request Body
```json
{ "enabled": true }
```

### Response (200)
```json
{ "success": true, "maintenanceMode": true }
```

---

## Notes for Frontend Implementation

- The frontend should pass a valid admin JWT in `Authorization: Bearer <token>`.
- Requests without a token will get `401`; requests with a non-admin user will get `403`.
- The frontend can safely call `GET /api/admin/settings` to hydrate UI state, then use the other endpoints for updates.

---

## User Registration (Phone number requirement)

To support M-Pesa payments, users (both buyers and photographers) must provide a valid phone number during registration.

- Field name: `phoneNumber`
- Required format: `254XXXXXXXXX` (e.g., `254712345678`)
- The backend validates this on registration and update and returns `400` if the format is invalid.

---

## Frontend UI Integration (Suggested)

### Recommended data flow
1. **Load settings on mount**
   - Call `GET /api/admin/settings`
   - Store response in local state (e.g. React `useState` / context)
2. **Edit settings in form fields**
   - Keep form values in component state.
   - On save, send entire payload to `PUT /api/admin/settings`.
3. **Update specific values (optional)**
   - For quick updates (platform fee, payout, maintenance mode), call the dedicated endpoints.

### Example: Fetch settings (Axios)
```js
import axios from "axios";

const API = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL || "https://pm-backend-f3b6.onrender.com/api",
  headers: {
    "Content-Type": "application/json",
  },
});

export const setAuthToken = (token) => {
  API.defaults.headers.common["Authorization"] = `Bearer ${token}`;
};

export const fetchAdminSettings = () => API.get("/admin/settings");
export const saveAdminSettings = (settings) => API.put("/admin/settings", settings);
export const updatePlatformFee = (fee) => API.put("/admin/settings/platform-fee", { fee });
export const updateMinPayout = (minPayout) => API.put("/admin/settings/payout", { minPayout });
export const sendTestEmail = (payload) => API.post("/admin/settings/test-email", payload);
export const clearSettingsCache = () => API.post("/admin/clear-cache");
export const setMaintenanceMode = (enabled) => API.post("/admin/maintenance-mode", { enabled });
```

### Example: React hook usage
```js
import { useEffect, useState } from "react";
import { fetchAdminSettings, saveAdminSettings } from "./api";

export function useAdminSettings(token) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) return;

    setLoading(true);
    setError(null);

    fetchAdminSettings()
      .then((res) => {
        setSettings(res.data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err);
        setLoading(false);
      });
  }, [token]);

  const save = async (updatedSettings) => {
    setLoading(true);
    setError(null);

    const response = await saveAdminSettings(updatedSettings);
    setSettings(response.data.settings);
    setLoading(false);
    return response.data;
  };

  return { settings, loading, error, save };
}
```

### Maintenance mode (frontend behavior)
- The backend stores `maintenanceMode` as a boolean.
- The frontend can choose to:
  - Show a banner/overlay if `maintenanceMode` is `true`.
  - Disable editing or redirect non-admin users.

---

## Cart Checkout + Auto Download (Buyer)

The buyer completes checkout from the **cart page**. Once payment is confirmed, the frontend should automatically initiate the download of each purchased media item.

### Recommended Flow
1. **Load cart**
   - `GET /api/cart/:userId`
2. **Checkout**
   - The frontend calls the existing payment endpoint (e.g., `POST /api/payments/buy`) for each item in the cart.
   - When payment completes, the backend records the purchase and sets `status: "completed"` on the payment.
3. **Get a secure download URL**
   - For each purchased item, call `GET /api/media/:id/protected`.
   - Include authenticated user info (JWT) so the backend can verify the purchase.
   - The response includes `downloadUrl` which is a short-lived, secure link.
4. **Auto-download**
   - Once you have the `downloadUrl`, trigger a browser download:
     ```js
     window.location.href = downloadUrl;
     ```

> Note: The backend only returns `downloadUrl` if the user has a completed payment for that media.

---

## Backend Implementation Details

- Settings are stored in MongoDB via `models/settings.js` (single-document pattern).
- The backend caches the settings in memory for performance and supports cache clearing via `POST /api/admin/clear-cache`.
- Settings validation is performed for:
  - `platformFee` (0-100)
  - `minPayout` (>= 0)
  - `maintenanceMode` (boolean)

---

_End of document._

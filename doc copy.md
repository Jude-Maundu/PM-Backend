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
   - A valid JWT is required so the backend can validate the purchase.
   - The response includes `downloadUrl` which is a short-lived, secure link.
4. **Auto-download**
   - Once you have the `downloadUrl`, trigger a browser download:
     ```js
     window.location.href = downloadUrl;
     ```

> Note: The backend only returns `downloadUrl` if the user has a completed payment for that media.

---

## Private Event Link (Photographer → Buyer)

Photographers can create an **Album (event)** to group media together, then generate a private link (or QR) that allows a specific buyer to view the event media and add items to their cart.

---

## 🎛️ Album UI (Photographer)

Photographers can create and manage **Albums (events)** and then generate private access links for buyers.

### What this section shows
- How to create an album (event)
- How to generate a share link for an album
- How to make the UI clear and visible (with concise code)

---

## ✅ Recommended UI flow
1. **Create an Album** (event)
2. **Show the photographer’s albums** in a list (optional but helpful)
3. **Generate a share link** for the selected album (get a token)

---

## 1) Create an album (event)

Use `POST /api/media/album` to create an album. The response includes the album `_id`, which you later use to generate a share link.

### Minimal React example (create button + form)
```jsx
import { useState } from "react";
import axios from "axios";

export function CreateAlbum({ token, onCreated }) {
  const [name, setName] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setError(null);
    setLoading(true);

    try {
      const res = await axios.post(
        "/api/media/album",
        { name, description, coverImage },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      onCreated(res.data.album);
      setName("");
      setDescription("");
      setCoverImage("");
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ border: "1px solid #ccc", padding: 16, borderRadius: 8 }}>
      <h3>Create Event (Album)</h3>
      <input
        placeholder="Event name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        placeholder="Cover image URL"
        value={coverImage}
        onChange={(e) => setCoverImage(e.target.value)}
      />
      <textarea
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <button onClick={handleCreate} disabled={loading || !name}>
        {loading ? "Creating..." : "Create Album"}
      </button>
      {error && <div style={{ color: "red" }}>{error}</div>}
    </div>
  );
}
```

> Use `onCreated` to add the new album to your UI list and enable share-link generation.

---

## 2) Generate a share link for an album

Once you have an album `_id`, call `POST /api/media/album/:albumId/access`.

### Example (Axios)
```js
const createShareLink = async (albumId, token, buyerEmail) => {
  const res = await axios.post(
    `/api/media/album/${albumId}/access`,
    { email: buyerEmail, expiresInMinutes: 60 },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data.accessLink;
};
```

Use that URL to show a “Copy link” or “Generate QR” button in your UI.

---

## Quick endpoint summary (for your UI)
- **Create album**: `POST /api/media/album`
- **Generate share link**: `POST /api/media/album/:albumId/access`
- **Buyer uses link**: `GET /api/media/album/:albumId/access/:token`

---

### 0) Create an album (event)

**POST** `/api/media/album`

- Requires photographer auth (JWT + `role: "photographer"`).
- Request body example:
  ```json
  {
    "name": "My Event Name",
    "description": "Optional event description",
    "coverImage": "https://.../cover.jpg"
  }
  ```

- Response includes the created album, including its `_id` (use this as `albumId` when generating access links).

### 1) Create event access link (photographer)

**POST** `/api/media/album/:albumId/access`

- Requires photographer auth (JWT + `role: "photographer"`).
- `albumId` must be the **Album (event) ID**, not a media item ID.
  - If you are using media records, use the `album` field from that media.
- Body example (any one of these buyer identifiers is required):
  ```json
  {
    "buyerId": "<buyerUserId>",
    "expiresInMinutes": 60
  }
  ```

  ```json
  {
    "buyerEmail": "buyer@example.com",
    "expiresInMinutes": 60
  }
  ```

  ```json
  {
    "email": "buyer@example.com",
    "expiresInMinutes": 60
  }
  ```

  ```json
  {
    "buyerPhone": "254712345678",
    "expiresInMinutes": 60
  }
  ```

> Note: `email` is an alias for `buyerEmail` so you can send whichever field is easiest from your frontend.
> The backend generates the token using the buyer's email (so the frontend does not need to share MongoDB IDs).
>
> Example (Axios):
> ```js
> const response = await axios.post(
>   `/api/media/album/${albumId}/access`,
>   { email: "buyer@example.com", expiresInMinutes: 60 },
>   { headers: { Authorization: `Bearer ${token}` } }
> );
> console.log(response.data.accessLink);
> ```
>
> Note: The backend will resolve the buyer using `buyerId`, `buyerEmail`, or `buyerPhone`. The buyer must already exist in the system (registered).
- Response includes `accessLink` (a URL the buyer can open), e.g.:
  - `https://your-frontend.com/events/:albumId/access/:token`

### 2) Buyer accesses media via link

When the buyer opens the link, the frontend should call:

**GET** `/api/media/album/:albumId/access/:token`

- Response includes the list of media in the event and buyer/photographer info.
- The buyer can then add items to cart normally and proceed to checkout.

### 3) Admin oversight (optional)

Admins can access any protected media downloads without needing a purchase. This allows admins to audit content and verify delivery.

- Admins must call `GET /api/media/:id/protected` with a valid admin JWT.
- The backend will bypass the purchase check for `role: "admin"`.

### 4) Admin purchase audit endpoint

Admins can retrieve a list of completed purchases (with buyer, media, and a download link) via:

**GET** `/api/admin/audit/purchases`

Optional query params:
- `buyerId` — filter by buyer user ID
- `photographerId` — filter by photographer user ID

Response includes entries like:
```json
{
  "audit": [
    {
      "paymentId": "...",
      "buyer": { "_id": "...", "username": "...", "email": "..." },
      "media": { "_id": "...", "title": "...", "fileUrl": "..." },
      "amount": 100,
      "status": "completed",
      "createdAt": "...",
      "downloadUrl": "/api/media/.../download?token=...&user=..."
    }
  ]
}
```

### 5) Optional: Generate QR code (frontend)

The backend returns a normal access URL. The frontend can convert that URL into a QR code using any QR library (e.g., `qrcode.react` or `qrcode-generator`).

---

## Frontend UI Sketch (Admin Purchase Audit)

The admin can use **`GET /api/admin/audit/purchases`** to see purchased media and download links. A simple UI could include:

- A table showing:
  - Buyer name / email
  - Photographer name / email
  - Media title
  - Purchase amount
  - Purchase date
  - A "Download" button that hits the `downloadUrl`
- Filters:
  - Buyer ID (or search by email)
  - Photographer ID (or search by email)

### Example React layout (pseudo)

```jsx
function AdminPurchaseAudit({ token }) {
  const [audit, setAudit] = useState([]);
  const [filters, setFilters] = useState({ buyerId: "", photographerId: "" });

  useEffect(() => {
    if (!token) return;
    fetchAudit();
  }, [token]);

  const fetchAudit = async () => {
    const params = new URLSearchParams();
    if (filters.buyerId) params.append("buyerId", filters.buyerId);
    if (filters.photographerId) params.append("photographerId", filters.photographerId);

    const res = await fetch(
      `${API_BASE}/admin/audit/purchases?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    const data = await res.json();
    setAudit(data.audit || []);
  };

  return (
    <div>
      <h2>Purchase Audit</h2>
      <div>
        <input
          value={filters.buyerId}
          onChange={(e) => setFilters((f) => ({ ...f, buyerId: e.target.value }))}
          placeholder="Filter by buyerId"
        />
        <input
          value={filters.photographerId}
          onChange={(e) => setFilters((f) => ({ ...f, photographerId: e.target.value }))}
          placeholder="Filter by photographerId"
        />
        <button onClick={fetchAudit}>Refresh</button>
      </div>

      <table>
        <thead>
          <tr>
            <th>Buyer</th>
            <th>Photographer</th>
            <th>Media</th>
            <th>Amount</th>
            <th>Date</th>
            <th>Download</th>
          </tr>
        </thead>
        <tbody>
          {audit.map((row) => (
            <tr key={row.paymentId}>
              <td>{row.buyer?.email}</td>
              <td>{row.media?.photographer?.email}</td>
              <td>{row.media?.title}</td>
              <td>{row.amount}</td>
              <td>{new Date(row.createdAt).toLocaleString()}</td>
              <td>
                <a href={row.downloadUrl} target="_blank" rel="noreferrer">
                  Download
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

> This UI is a sketch — adjust columns, filters, and styling as needed.

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

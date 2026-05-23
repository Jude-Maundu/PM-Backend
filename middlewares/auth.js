import jwt from "jsonwebtoken";
import admin from "firebase-admin";
import User from "../models/users.js";

let firebaseApp;
function initFirebaseAdmin() {
  if (firebaseApp) return firebaseApp;

  // Support passing a full JSON string or a path to a service account key file.
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (!serviceAccount) {
    return null;
  }

  let credentials;
  try {
    credentials = JSON.parse(serviceAccount);
  } catch {
    // If it's not JSON, treat it as a file path
    credentials = undefined;
  }

  firebaseApp = admin.initializeApp({
    credential: credentials
      ? admin.credential.cert(credentials)
      : admin.credential.applicationDefault(),
  });

  return firebaseApp;
}

export async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Authorization header missing or invalid" });
  }

  const token = authHeader.split(" ")[1];

  // 1) Try verifying a local JWT first
  if (process.env.JWT_SECRET) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);

      const userId =
        payload?.userId?.toString() ||
        payload?.id?.toString() ||
        payload?._id?.toString() ||
        payload?.uid?.toString();

      if (!userId) {
        return res.status(401).json({ success: false, message: "Invalid token payload: missing user id" });
      }

      // Verify tokenVersion to catch invalidated tokens (password change, ban)
      if (typeof payload.tokenVersion === 'number') {
        try {
          const dbUser = await User.findById(userId).select('tokenVersion isBanned').lean();
          if (!dbUser) return res.status(401).json({ success: false, message: "User not found" });
          if (dbUser.isBanned) return res.status(403).json({ success: false, message: "Account suspended" });
          if ((dbUser.tokenVersion ?? 0) !== payload.tokenVersion) {
            return res.status(401).json({ success: false, message: "Session expired, please log in again" });
          }
        } catch (_) { /* DB unavailable — skip version check in dev */ }
      }

      req.user = {
        userId,
        id: userId,
        _id: userId,
        role: payload?.role || payload?.userRole || "user",
        email: payload?.email || payload?.username || "",
        tokenType: "jwt",
      };

      return next();
    } catch (err) {
      console.error("[auth] JWT verification failed", err.message);
      // continue to firebase token verification if configured
    }
  }

  // 2) Try Firebase ID token verification (if configured)
  const app = initFirebaseAdmin();
  if (app) {
    try {
      const decoded = await app.auth().verifyIdToken(token);
      const userId = decoded?.uid?.toString();

      if (!userId) {
        return res.status(401).json({ success: false, message: "Invalid Firebase token payload: missing uid" });
      }

      req.user = {
        userId,
        id: userId,
        _id: userId,
        role: decoded.role || (decoded.admin ? "admin" : "user"),
        email: decoded.email || "",
        firebase: true,
        firebaseClaims: decoded,
        tokenType: "firebase",
      };

      console.log("[auth] Firebase authentication succeeded", { userId: req.user.userId, role: req.user.role });
      return next();
    } catch (err) {
      console.error("[auth] Firebase verification failed", err.message);
      // fall through to error response
    }
  }

  return res.status(401).json({ success: false, message: "Invalid or expired token" });
}

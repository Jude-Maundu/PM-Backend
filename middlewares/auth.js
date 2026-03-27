import jwt from "jsonwebtoken";
import admin from "firebase-admin";

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

      req.user = {
        userId,
        id: userId,
        _id: userId,
        role: payload?.role || payload?.userRole || "user",
        email: payload?.email || payload?.username || "",
        tokenType: "jwt",
      };

      console.log("[auth] JWT authentication succeeded", { userId: req.user.userId, role: req.user.role, endpoint: req.originalUrl });
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

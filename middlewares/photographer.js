export function requirePhotographer(req, res, next) {
  if (!req.user) {
    console.warn("[requirePhotographer] missing req.user");
    return res.status(401).json({ message: "Authentication required" });
  }

  const role = String(req.user.role || "").toLowerCase().trim();
  if (!role.includes("photographer")) {
    console.warn("[requirePhotographer] forbidden role", { role, userId: req.user.userId });
    return res.status(403).json({ message: "Forbidden: Photographers only" });
  }

  next();
}

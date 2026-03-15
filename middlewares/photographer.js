export function requirePhotographer(req, res, next) {
  if (!req.user || req.user.role !== "photographer") {
    return res.status(403).json({ message: "Forbidden: Photographers only" });
  }
  next();
}

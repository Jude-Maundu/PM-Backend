import AdminLog from '../models/AdminLog.js';

const STAFF_ROLES = ['admin', 'reviewer', 'support', 'secretary', 'engineer', 'marketing'];

// Allow admin + reviewer
export function requireReviewer(req, res, next) {
  const role = req.user?.role;
  if (role === 'admin' || role === 'reviewer') return next();
  return res.status(403).json({ message: 'Reviewer access required' });
}

// Allow admin + all staff roles
export function requireSupport(req, res, next) {
  const role = req.user?.role;
  if (STAFF_ROLES.includes(role)) return next();
  return res.status(403).json({ message: 'Staff access required' });
}

// Allow any authenticated staff member (secretary, engineer, marketing, reviewer, support, admin)
export function requireStaff(req, res, next) {
  const role = req.user?.role;
  if (STAFF_ROLES.includes(role)) return next();
  return res.status(403).json({ message: 'Staff access required' });
}

// Middleware factory — logs admin actions to AdminLog collection
export function logAdminAction(action, entityType = '') {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = async (body) => {
      // Only log on successful responses
      if (res.statusCode < 400) {
        try {
          const adminId = req.user?.userId || req.user?.id || req.user?._id;
          const adminName = req.user?.email || req.user?.username || 'unknown';
          const entityId = req.params?.id || req.params?.userId || req.params?.withdrawalId || req.params?.mediaId || '';

          await AdminLog.create({
            admin: adminId,
            adminName,
            action,
            entityType,
            entityId: String(entityId),
            details: {
              body: sanitizeBody(req.body),
              response: typeof body === 'object' ? { message: body?.message } : undefined,
            },
            ip: req.ip || req.headers['x-forwarded-for'] || '',
          });
        } catch (_) { /* log failures must never break the response */ }
      }
      return originalJson(body);
    };
    next();
  };
}

function sanitizeBody(body = {}) {
  const safe = { ...body };
  delete safe.password;
  delete safe.confirmPassword;
  delete safe.token;
  return safe;
}

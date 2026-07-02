import { AuthService } from '../services/authService.js';
import { getDb } from '../db/database.js';

const authService = new AuthService();
const PUBLIC_PATHS = ['/auth/register', '/auth/login', '/auth/forgot-password', '/auth/reset-password', '/api/status', '/status'];

export function authMiddleware(req, res, next) {
  if (PUBLIC_PATHS.some(p => req.path === p || req.path.startsWith(p + '/'))) {
    req.tenant = { id: null, tenantId: null, userId: null, role: 'guest' };
    return next();
  }

  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const decoded = authService.verifyToken(token);
    if (decoded) {
      req.tenant = { id: decoded.tenantId, tenantId: decoded.tenantId, userId: decoded.userId, role: decoded.role };
      req.user = { id: decoded.userId, tenantId: decoded.tenantId, role: decoded.role };
      // Load effective permissions from RBAC
      try {
        const db = getDb();
        const roles = db.prepare(`
          SELECT r.permissions FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = ? AND ur.tenant_id = ?
        `).all(decoded.userId, decoded.tenantId);
        const perms = new Set();
        for (const role of roles) {
          let p;
          try { p = typeof role.permissions === 'string' ? JSON.parse(role.permissions) : (role.permissions || []); }
          catch { p = []; }
          for (const perm of p) perms.add(perm);
        }
        req.tenant.permissions = [...perms];
      } catch (e) {
        req.tenant.permissions = [];
      }
      return next();
    }
  }

  return res.status(401).json({ error: true, message: 'الرجاء تسجيل الدخول أولاً' });
}

export function requirePermission(resource) {
  return (req, res, next) => {
    if (req.tenant?.role === 'admin') return next();
    if (req.tenant?.permissions?.includes(resource)) return next();
    return res.status(403).json({ error: true, message: 'ليس لديك صلاحية للوصول إلى هذا المورد' });
  };
}

export function errorHandler(err, req, res, _next) {
  console.error('[Error]', err.message || err);
  res.status(err.status || 500).json({
    error: true,
    message: err.message || 'Internal server error',
  });
}

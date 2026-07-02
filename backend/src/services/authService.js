import { getDb } from '../db/database.js';
import { generateId, now } from './helpers.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'mullak-proptech-secret-2026';

export class AuthService {
  forgotPassword(phone) {
    const db = getDb();
    const user = db.prepare('SELECT id, email, phone FROM users WHERE phone = ? AND is_active = 1').get(phone);
    if (!user) throw Object.assign(new Error('رقم الجوال غير مسجل في النظام'), { status: 404 });
    const resetToken = generateId() + '-' + Date.now();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    db.prepare('UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?').run(resetToken, expiresAt, user.id);
    return { reset_token: resetToken, message: 'تم إرسال رمز إعادة التعيين' };
  }

  resetPassword(resetToken, newPassword) {
    if (!newPassword || newPassword.length < 6) throw Object.assign(new Error('كلمة المرور يجب أن تكون 6 أحرف على الأقل'), { status: 400 });
    const db = getDb();
    const user = db.prepare('SELECT id, reset_expires FROM users WHERE reset_token = ?').get(resetToken);
    if (!user) throw Object.assign(new Error('رمز إعادة التعيين غير صالح'), { status: 400 });
    if (user.reset_expires && new Date(user.reset_expires) < new Date()) throw Object.assign(new Error('انتهت صلاحية رمز إعادة التعيين'), { status: 400 });
    const passwordHash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?').run(passwordHash, user.id);
    return { message: 'تم تغيير كلمة المرور بنجاح' };
  }

  register(data) {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(data.email);
    if (existing) throw Object.assign(new Error('البريد الإلكتروني مسجل مسبقاً'), { status: 409 });

    const type = data.customer_type || 'individual';
    if (!['individual', 'company'].includes(type)) throw Object.assign(new Error('نوع الحساب غير صحيح'), { status: 400 });

    // Validate required fields
    if (type === 'individual') {
      if (!data.full_name_ar) throw Object.assign(new Error('الاسم مطلوب'), { status: 400 });
      if (!data.national_id) throw Object.assign(new Error('رقم الهوية مطلوب'), { status: 400 });
    } else {
      if (!data.company_name_ar) throw Object.assign(new Error('اسم المؤسسة مطلوب'), { status: 400 });
      if (!data.cr_number) throw Object.assign(new Error('رقم السجل التجاري مطلوب'), { status: 400 });
    }
    if (!data.email) throw Object.assign(new Error('البريد الإلكتروني مطلوب'), { status: 400 });
    if (!data.phone) throw Object.assign(new Error('رقم الجوال مطلوب'), { status: 400 });
    if (!data.fal_license_no) throw Object.assign(new Error('رقم رخصة منصة فال مطلوب'), { status: 400 });
    if (!data.password || data.password.length < 6) throw Object.assign(new Error('كلمة المرور يجب أن تكون 6 أحرف على الأقل'), { status: 400 });

    const tenantId = generateId();
    const userId = generateId();
    const passwordHash = bcrypt.hashSync(data.password, 10);

    // Create tenant — for individuals, use their name as the tenant name
    const tenantName = type === 'company' ? data.company_name_ar : data.full_name_ar;
    try {
      db.prepare(`
        INSERT INTO tenants (id, name_ar, name_en, cr_number, vat_number, phone, email, fal_license_no)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(tenantId, tenantName, tenantName,
        type === 'company' ? data.cr_number : `INDV-${data.national_id || Date.now()}`,
        data.vat_number || null, data.phone, data.email,
        data.fal_license_no || null);
    } catch (e) {
      if (e.message?.includes('UNIQUE constraint')) {
        throw Object.assign(new Error('رقم السجل التجاري أو البريد الإلكتروني مسجل مسبقاً'), { status: 409 });
      }
      throw e;
    }

    db.prepare(`
      INSERT INTO users (id, tenant_id, customer_type, national_id, full_name_ar, full_name_en, email, password_hash, phone, role, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(userId, tenantId, type,
      data.national_id || data.cr_number || '',
      type === 'individual' ? data.full_name_ar : data.company_name_ar,
      type === 'individual' ? data.full_name_ar : data.company_name_ar,
      data.email, passwordHash, data.phone, 'owner');

    const token = jwt.sign({ userId, tenantId, role: 'owner' }, JWT_SECRET, { expiresIn: '30d' });
    return { token, user: { id: userId, tenantId, customer_type: type, full_name_ar: tenantName, tenant_name_ar: tenantName, email: data.email, role: 'owner' } };
  }

  login(email, password) {
    const db = getDb();
    const user = db.prepare(`
      SELECT u.*, t.name_ar AS tenant_name_ar, t.cr_number, t.vat_number
      FROM users u JOIN tenants t ON t.id = u.tenant_id
      WHERE LOWER(u.email) = LOWER(?) AND u.is_active = 1
    `).get(email);
    if (!user || !user.password_hash) throw Object.assign(new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة'), { status: 401 });
    if (!bcrypt.compareSync(password, user.password_hash)) throw Object.assign(new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة'), { status: 401 });

    db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(now(), user.id);

    const token = jwt.sign({ userId: user.id, tenantId: user.tenant_id, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
    return {
      token,
      user: {
        id: user.id, tenantId: user.tenant_id,
        full_name_ar: user.full_name_ar, email: user.email,
        role: user.role, tenant_name_ar: user.tenant_name_ar
      }
    };
  }

  verifyToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch {
      return null;
    }
  }

  getProfile(userId, tenantId) {
    const db = getDb();
    return db.prepare(`
      SELECT u.id, u.full_name_ar, u.full_name_en, u.email, u.phone, u.role, u.last_login,
        t.name_ar AS tenant_name_ar, t.name_en AS tenant_name_en,
        t.cr_number, t.vat_number, t.city, t.subscription_plan
      FROM users u JOIN tenants t ON t.id = u.tenant_id
      WHERE u.id = ? AND u.tenant_id = ?
    `).get(userId, tenantId) || null;
  }
}

export function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const service = new AuthService();
    const decoded = service.verifyToken(token);
    if (decoded) {
      req.tenant = { tenantId: decoded.tenantId, userId: decoded.userId, role: decoded.role };
      return next();
    }
  }
  const tenantId = req.headers['x-tenant-id'] || req.query.tenant_id;
  const userId = req.headers['x-user-id'];
  req.tenant = {
    tenantId: tenantId || 'default',
    userId: userId || 'system',
    role: 'owner',
    lang: req.headers['accept-language']?.startsWith('en') ? 'en' : 'ar',
  };
  next();
}

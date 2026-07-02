import { getDb } from '../db/database.js';
import { generateId } from './helpers.js';

export const ALL_PERMISSIONS = {
  dashboard: { ar: 'لوحة التحكم', en: 'Dashboard' },
  properties: { ar: 'العقارات', en: 'Properties' },
  units: { ar: 'الوحدات', en: 'Units' },
  contracts: { ar: 'العقود', en: 'Contracts' },
  receipts: { ar: 'المقبوضات', en: 'Receipts' },
  payments: { ar: 'المدفوعات', en: 'Payments' },
  customers: { ar: 'العملاء', en: 'Customers' },
  owners: { ar: 'الملاك', en: 'Owners' },
  vendors: { ar: 'الموردون', en: 'Vendors' },
  purchases: { ar: 'المشتريات', en: 'Purchases' },
  inventory: { ar: 'المخزون', en: 'Inventory' },
  staff: { ar: 'الموظفين', en: 'Staff' },
  payroll: { ar: 'الرواتب', en: 'Payroll' },
  accounting: { ar: 'المحاسبة', en: 'Accounting' },
  zatca: { ar: 'الفوترة الإلكترونية', en: 'E-Invoicing' },
  ejar: { ar: 'إيجار', en: 'Ejar' },
  marketing: { ar: 'التسويق', en: 'Marketing' },
  deals: { ar: 'الصفقات', en: 'Deals' },
  maintenance: { ar: 'الصيانة', en: 'Maintenance' },
  reports: { ar: 'التقارير', en: 'Reports' },
  settings: { ar: 'الإعدادات', en: 'Settings' },
  rbac: { ar: 'الصلاحيات', en: 'RBAC' },
};

export const DEFAULT_ROLES = [
  {
    name_ar: 'مدير النظام',
    name_en: 'Admin',
    permissions: Object.keys(ALL_PERMISSIONS),
    is_system: 1,
  },
  {
    name_ar: 'مدير',
    name_en: 'Manager',
    permissions: ['dashboard','properties','units','contracts','receipts','payments','customers','owners','staff','marketing','deals','reports'],
    is_system: 0,
  },
  {
    name_ar: 'محاسب',
    name_en: 'Accountant',
    permissions: ['dashboard','receipts','payments','accounting','zatca','reports'],
    is_system: 0,
  },
  {
    name_ar: 'مسوق',
    name_en: 'Marketer',
    permissions: ['dashboard','marketing','deals','customers'],
    is_system: 0,
  },
  {
    name_ar: 'موظف صيانة',
    name_en: 'Maintenance',
    permissions: ['dashboard','maintenance','units'],
    is_system: 0,
  },
  {
    name_ar: 'مشرف عقارات',
    name_en: 'Property Supervisor',
    permissions: ['dashboard','properties','units','contracts','customers','maintenance'],
    is_system: 0,
  },
  {
    name_ar: 'مشرف',
    name_en: 'Supervisor',
    permissions: ['dashboard','properties','units','contracts','receipts','customers','owners','staff','marketing','deals','reports'],
    is_system: 0,
  },
];

// ── Roles CRUD ──────────────────────────────────────────────

export function listRoles(tenantId) {
  const db = getDb();
  const roles = db.prepare(`
    SELECT r.*, (SELECT COUNT(*) FROM user_roles WHERE role_id = r.id AND tenant_id = r.tenant_id) AS users_count
    FROM roles r WHERE r.tenant_id = ? ORDER BY r.is_system DESC, r.name_ar
  `).all(tenantId);
  if (roles.length === 0) seedRoles(tenantId);
  return roles.length > 0 ? roles : db.prepare(`
    SELECT r.*, (SELECT COUNT(*) FROM user_roles WHERE role_id = r.id AND tenant_id = r.tenant_id) AS users_count
    FROM roles r WHERE r.tenant_id = ? ORDER BY r.is_system DESC, r.name_ar
  `).all(tenantId);
}

export function getRole(tenantId, id) {
  const db = getDb();
  return db.prepare(`SELECT * FROM roles WHERE id = ? AND tenant_id = ?`).get(id, tenantId);
}

export function createRole(tenantId, data) {
  const db = getDb();
  const id = generateId();
  const perms = Array.isArray(data.permissions) ? data.permissions : [];
  db.prepare(`INSERT INTO roles (id, tenant_id, name_ar, name_en, description, permissions) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, tenantId, data.name_ar, data.name_en || '', data.description || '', JSON.stringify(perms));
  return getRole(tenantId, id);
}

export function updateRole(tenantId, id, data) {
  const db = getDb();
  const existing = getRole(tenantId, id);
  if (!existing) throw new Error('الدور غير موجود');
  if (existing.is_system) throw new Error('لا يمكن تعديل دور النظام');
  const perms = data.permissions !== undefined
    ? JSON.stringify(Array.isArray(data.permissions) ? data.permissions : [])
    : existing.permissions;
  db.prepare(`UPDATE roles SET name_ar=?, name_en=?, description=?, permissions=?, updated_at=datetime('now') WHERE id=? AND tenant_id=?`)
    .run(data.name_ar || existing.name_ar, data.name_en !== undefined ? data.name_en : existing.name_en,
      data.description !== undefined ? data.description : existing.description, perms, id, tenantId);
  return getRole(tenantId, id);
}

export function deleteRole(tenantId, id) {
  const db = getDb();
  const existing = getRole(tenantId, id);
  if (!existing) throw new Error('الدور غير موجود');
  if (existing.is_system) throw new Error('لا يمكن حذف دور النظام');
  db.prepare(`DELETE FROM roles WHERE id=? AND tenant_id=?`).run(id, tenantId);
  return { deleted: true };
}

export function seedRoles(tenantId) {
  const db = getDb();
  const existing = db.prepare(`SELECT COUNT(*) AS c FROM roles WHERE tenant_id = ?`).get(tenantId);
  if (existing.c > 0) return;
  const stmt = db.prepare(`INSERT INTO roles (id, tenant_id, name_ar, name_en, description, permissions, is_system) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  for (const role of DEFAULT_ROLES) {
    stmt.run(generateId(), tenantId, role.name_ar, role.name_en, '', JSON.stringify(role.permissions), role.is_system);
  }
}

// ── User Role Assignment ────────────────────────────────────

export function getUserRoles(tenantId, userId) {
  const db = getDb();
  return db.prepare(`
    SELECT ur.*, r.name_ar AS role_name_ar, r.name_en AS role_name_en, r.permissions, r.is_system
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.tenant_id = ? AND ur.user_id = ?
  `).all(tenantId, userId);
}

export function assignRole(tenantId, userId, roleId, branchId) {
  const db = getDb();
  const existing = db.prepare(`SELECT id FROM user_roles WHERE tenant_id=? AND user_id=? AND role_id=? AND COALESCE(branch_id,'')=COALESCE(?,'')`).get(tenantId, userId, roleId, branchId || '');
  if (existing) return { message: 'الدور مضاف مسبقاً' };
  const id = generateId();
  db.prepare(`INSERT INTO user_roles (id, tenant_id, user_id, role_id, branch_id) VALUES (?, ?, ?, ?, ?)`)
    .run(id, tenantId, userId, roleId, branchId || null);
  logPermission(tenantId, userId, 'assign_role', 'user_roles', 1);
  return getUserRoles(tenantId, userId);
}

export function unassignRole(tenantId, userId, roleId) {
  const db = getDb();
  db.prepare(`DELETE FROM user_roles WHERE tenant_id=? AND user_id=? AND role_id=?`).run(tenantId, userId, roleId);
  return { deleted: true };
}

export function getUsersWithRoles(tenantId) {
  const db = getDb();
  const users = db.prepare(`
    SELECT u.id, u.full_name_ar, u.full_name_en, u.email, u.phone, u.role AS legacy_role, u.is_active
    FROM users u WHERE u.tenant_id = ? ORDER BY u.full_name_ar
  `).all(tenantId);
  return users.map(u => {
    u.roles = db.prepare(`
      SELECT r.id, r.name_ar, r.name_en, r.permissions, ur.branch_id
      FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? AND ur.tenant_id = ?
    `).all(u.id, tenantId);
    u.effective_permissions = computeEffectivePermissions(u.roles);
    return u;
  });
}

function computeEffectivePermissions(userRoles) {
  const perms = new Set();
  for (const role of userRoles) {
    let rolePerms;
    try { rolePerms = typeof role.permissions === 'string' ? JSON.parse(role.permissions) : (role.permissions || []); }
    catch { rolePerms = []; }
    for (const p of rolePerms) perms.add(p);
  }
  return [...perms];
}

export function checkPermission(user, resource) {
  if (user.role === 'admin') return true;
  if (!user.permissions) return false;
  return user.permissions.includes(resource);
}

export function getEffectivePermissions(tenantId, userId) {
  const roles = getUserRoles(tenantId, userId);
  return computeEffectivePermissions(roles);
}

export function getUserPermissionsMap(tenantId) {
  const db = getDb();
  const users = db.prepare(`SELECT id, full_name_ar, email FROM users WHERE tenant_id = ?`).all(tenantId);
  const result = {};
  for (const u of users) {
    result[u.id] = { name: u.full_name_ar, email: u.email, permissions: getEffectivePermissions(tenantId, u.id) };
  }
  return result;
}

function logPermission(tenantId, userId, action, resource, granted) {
  const db = getDb();
  db.prepare(`INSERT INTO permissions_log (tenant_id, user_id, action, resource, granted) VALUES (?, ?, ?, ?, ?)`)
    .run(tenantId, userId, action, resource, granted ? 1 : 0);
}

export function getPermissionLogs(tenantId, limit = 50) {
  const db = getDb();
  return db.prepare(`
    SELECT pl.*, u.full_name_ar AS user_name
    FROM permissions_log pl LEFT JOIN users u ON u.id = pl.user_id
    WHERE pl.tenant_id = ? ORDER BY pl.created_at DESC LIMIT ?
  `).all(tenantId, limit);
}

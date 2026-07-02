import { getDb } from '../db/database.js';
import { generateId } from './helpers.js';

export function listBranches(tenantId) {
  const db = getDb();
  return db.prepare(`
    SELECT b.*, u.full_name_ar AS manager_name,
      (SELECT COUNT(*) FROM properties WHERE branch_id = b.id) AS property_count,
      (SELECT COUNT(*) FROM users WHERE branch_id = b.id AND tenant_id = b.tenant_id) AS staff_count
    FROM branches b LEFT JOIN users u ON u.id = b.manager_id
    WHERE b.tenant_id = ? ORDER BY b.is_hq DESC, b.name_ar
  `).all(tenantId);
}

export function getBranch(tenantId, id) {
  const db = getDb();
  return db.prepare(`SELECT * FROM branches WHERE id = ? AND tenant_id = ?`).get(id, tenantId);
}

export function createBranch(tenantId, data) {
  const db = getDb();
  const id = generateId();
  db.prepare(`INSERT INTO branches (id, tenant_id, name_ar, name_en, code, city, phone, email, address, is_hq, manager_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, tenantId, data.name_ar, data.name_en || '', data.code || '', data.city || '', data.phone || '',
      data.email || '', data.address || '', data.is_hq ? 1 : 0, data.manager_id || null);
  return getBranch(tenantId, id);
}

export function updateBranch(tenantId, id, data) {
  const db = getDb();
  const existing = getBranch(tenantId, id);
  if (!existing) throw new Error('الفرع غير موجود');
  db.prepare(`UPDATE branches SET name_ar=?, name_en=?, code=?, city=?, phone=?, email=?, address=?, is_hq=?, manager_id=?, is_active=?, updated_at=datetime('now') WHERE id=? AND tenant_id=?`)
    .run(data.name_ar || existing.name_ar, data.name_en !== undefined ? data.name_en : existing.name_en,
      data.code !== undefined ? data.code : existing.code, data.city !== undefined ? data.city : existing.city,
      data.phone !== undefined ? data.phone : existing.phone, data.email !== undefined ? data.email : existing.email,
      data.address !== undefined ? data.address : existing.address,
      data.is_hq !== undefined ? (data.is_hq ? 1 : 0) : existing.is_hq,
      data.manager_id || existing.manager_id,
      data.is_active !== undefined ? (data.is_active ? 1 : 0) : existing.is_active,
      id, tenantId);
  return getBranch(tenantId, id);
}

export function deleteBranch(tenantId, id) {
  const db = getDb();
  const existing = getBranch(tenantId, id);
  if (!existing) throw new Error('الفرع غير موجود');
  if (existing.is_hq) throw new Error('لا يمكن حذف المقر الرئيسي');
  db.prepare(`DELETE FROM branches WHERE id=? AND tenant_id=?`).run(id, tenantId);
  return { deleted: true };
}

export function getBranchStats(tenantId) {
  const db = getDb();
  const branches = listBranches(tenantId);
  const total = branches.length;
  const hq = branches.filter(b => b.is_hq).length;
  return { total, hq, branches };
}

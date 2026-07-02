import { getDb } from '../db/database.js';
import { generateId, now } from './helpers.js';

export class RenterService {
  create(tenant, data) {
    const db = getDb();
    const id = generateId();

    // Check for duplicate national ID
    const existing = db.prepare(
      'SELECT id FROM renters WHERE tenant_id = ? AND national_id = ?'
    ).get(tenant.tenantId, data.national_id);

    if (existing) {
      return db.prepare('SELECT * FROM renters WHERE id = ?').get(existing.id);
    }

    db.prepare(`
      INSERT INTO renters (id, tenant_id, national_id, id_type, full_name_ar, full_name_en,
        phone, email, nationality, employer, monthly_income, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, tenant.tenantId, data.national_id, data.id_type || 'national',
      data.full_name_ar, data.full_name_en || null,
      data.phone || null, data.email || null,
      data.nationality || 'SA', data.employer || null,
      data.monthly_income || null, data.notes || null
    );

    return db.prepare('SELECT * FROM renters WHERE id = ?').get(id);
  }

  findOrCreate(tenant, data) {
    const db = getDb();
    let renter = db.prepare(
      'SELECT * FROM renters WHERE tenant_id = ? AND national_id = ?'
    ).get(tenant.tenantId, data.national_id);

    if (!renter) {
      renter = this.create(tenant, data);
    }

    return renter;
  }

  findAll(tenantId) {
    const db = getDb();
    return db.prepare(
      'SELECT * FROM renters WHERE tenant_id = ? ORDER BY created_at DESC'
    ).all(tenantId);
  }

  findById(tenantId, id) {
    const db = getDb();
    return db.prepare('SELECT * FROM renters WHERE id = ? AND tenant_id = ?').get(id, tenantId) || null;
  }
}

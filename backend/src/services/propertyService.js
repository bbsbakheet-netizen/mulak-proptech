import { getDb } from '../db/database.js';
import { generateId, now, paginate } from './helpers.js';

export class PropertyService {
  create(tenant, data) {
    const db = getDb();
    const id = generateId();

    db.prepare(`
      INSERT INTO properties (id, tenant_id, code, name_ar, name_en, property_type,
        deed_number, parcel_number, city, district, address_ar, address_en,
        lat, lng, floors_count, total_units, total_area_sqm, year_built, status, notes, meta)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, tenant.tenantId, data.code || null, data.name_ar, data.name_en || null,
      data.property_type || 'residential', data.deed_number || null, data.parcel_number || null,
      data.city || null, data.district || null, data.address_ar || null, data.address_en || null,
      data.lat || null, data.lng || null, data.floors_count || 1, data.total_units || 0,
      data.total_area_sqm || null, data.year_built || null, data.status || 'active',
      data.notes || null, JSON.stringify(data.meta || {})
    );

    const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(id);

    if (property.total_units > 0) {
      this._autoGenerateUnits(tenant, property);
    }

    const units = db.prepare('SELECT * FROM units WHERE property_id = ? ORDER BY floor_number, unit_number')
      .all(id);

    return { property, unitsGenerated: units.length, units };
  }

  findAll(tenantId, query = {}) {
    const db = getDb();
    const { limit, offset } = paginate(query, query, db);

    let sql = 'SELECT * FROM properties WHERE tenant_id = ?';
    const params = [tenantId];

    if (query.type) {
      sql += ' AND property_type = ?';
      params.push(query.type);
    }
    if (query.status) {
      sql += ' AND status = ?';
      params.push(query.status);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = db.prepare(sql).all(...params);
    const total = db.prepare('SELECT COUNT(*) as count FROM properties WHERE tenant_id = ?')
      .get(tenantId).count;

    return { data: rows, total, page: query.page || 1, limit };
  }

  findById(tenantId, id) {
    const db = getDb();
    return db.prepare('SELECT * FROM properties WHERE id = ? AND tenant_id = ?').get(id, tenantId) || null;
  }

  update(tenantId, id, data) {
    const db = getDb();
    const existing = this.findById(tenantId, id);
    if (!existing) return null;

    const fields = [];
    const params = [];

    for (const [key, value] of Object.entries(data)) {
      if (key === 'id' || key === 'tenant_id' || key === 'created_at') continue;
      const col = key.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
      fields.push(`${col} = ?`);
      params.push(value !== undefined ? value : existing[key]);
    }

    fields.push('updated_at = ?');
    params.push(now());
    params.push(id, tenantId);

    db.prepare(`UPDATE properties SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`)
      .run(...params);

    return this.findById(tenantId, id);
  }

  getUnits(tenantId, propertyId, status) {
    const db = getDb();
    let sql = 'SELECT * FROM units WHERE tenant_id = ? AND property_id = ?';
    const params = [tenantId, propertyId];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY floor_number ASC, unit_number ASC';
    return db.prepare(sql).all(...params);
  }

  getOccupancy(tenantId, propertyId) {
    const db = getDb();
    return db.prepare(`
      SELECT
        p.*,
        COUNT(u.id) AS total_units,
        SUM(CASE WHEN u.status = 'occupied' THEN 1 ELSE 0 END) AS occupied_units,
        SUM(CASE WHEN u.status = 'vacant' THEN 1 ELSE 0 END) AS vacant_units,
        SUM(CASE WHEN u.status = 'maintenance' THEN 1 ELSE 0 END) AS maintenance_units,
        ROUND(CAST(SUM(CASE WHEN u.status = 'occupied' THEN 1 ELSE 0 END) AS REAL) /
          NULLIF(COUNT(u.id), 0) * 100, 2) AS occupancy_rate,
        COALESCE(SUM(CASE WHEN u.status = 'occupied' THEN u.base_rent ELSE 0 END), 0) AS monthly_revenue
      FROM properties p
      LEFT JOIN units u ON u.property_id = p.id
      WHERE p.tenant_id = ? AND p.id = ?
      GROUP BY p.id
    `).get(tenantId, propertyId) || null;
  }

  getDashboardStats(tenantId) {
    const db = getDb();
    const stats = db.prepare(`
      SELECT
        COUNT(DISTINCT p.id) AS total_properties,
        COUNT(u.id) AS total_units,
        SUM(CASE WHEN u.status = 'occupied' THEN 1 ELSE 0 END) AS occupied_units,
        SUM(CASE WHEN u.status = 'vacant' THEN 1 ELSE 0 END) AS vacant_units,
        SUM(CASE WHEN u.status = 'maintenance' THEN 1 ELSE 0 END) AS maintenance_units,
        COALESCE(SUM(CASE WHEN u.status = 'occupied' THEN u.base_rent ELSE 0 END), 0) AS monthly_revenue,
        ROUND(CAST(SUM(CASE WHEN u.status = 'occupied' THEN 1 ELSE 0 END) AS REAL) /
          NULLIF(COUNT(u.id), 0) * 100, 2) AS occupancy_rate
      FROM properties p
      LEFT JOIN units u ON u.property_id = p.id
      WHERE p.tenant_id = ?
    `).get(tenantId);
    return stats;
  }

  addUnit(tenant, data) {
    const db = getDb();
    const id = generateId();

    db.prepare(`
      INSERT INTO units (id, tenant_id, property_id, unit_number, unit_type,
        floor_number, area_sqm, bedrooms, bathrooms, base_rent, status,
        water_meter_no, electricity_meter_no, gas_meter_no, features, images, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, tenant.tenantId, data.property_id, data.unit_number, data.unit_type || 'apartment',
      data.floor_number || 1, data.area_sqm || null, data.bedrooms || 0, data.bathrooms || 0,
      data.base_rent || 0, data.status || 'vacant',
      data.water_meter_no || null, data.electricity_meter_no || null, data.gas_meter_no || null,
      JSON.stringify(data.features || []), JSON.stringify(data.images || []),
      data.notes || null
    );

    return db.prepare('SELECT * FROM units WHERE id = ?').get(id);
  }

  updateUnit(tenantId, unitId, data) {
    const db = getDb();
    const unit = db.prepare('SELECT * FROM units WHERE id = ? AND tenant_id = ?').get(unitId, tenantId);
    if (!unit) return null;

    const fields = [];
    const params = [];
    for (const [key, value] of Object.entries(data)) {
      if (key === 'id' || key === 'tenant_id' || key === 'created_at') continue;
      const col = key.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
      fields.push(`${col} = ?`);
      params.push(value !== undefined ? value : unit[key]);
    }
    fields.push('updated_at = ?');
    params.push(now(), unitId, tenantId);

    db.prepare(`UPDATE units SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`)
      .run(...params);

    return db.prepare('SELECT * FROM units WHERE id = ?').get(unitId);
  }

  _autoGenerateUnits(tenant, property) {
    const db = getDb();
    const totalUnits = property.total_units;
    const floors = Math.max(1, property.floors_count || 1);
    const perFloor = Math.ceil(totalUnits / floors);
    const unitType = property.property_type === 'hotel' ? 'hotel_room'
      : property.property_type === 'commercial' ? 'office' : 'apartment';

    const insert = db.prepare(`
      INSERT OR IGNORE INTO units (id, tenant_id, property_id, unit_number, unit_type, floor_number, base_rent, status)
      VALUES (?, ?, ?, ?, ?, ?, 0, 'vacant')
    `);

    const insertMany = db.transaction(() => {
      for (let i = 1; i <= totalUnits; i++) {
        const fl = Math.ceil(i / perFloor);
        const seq = ((i - 1) % perFloor) + 1;
        const num = `${fl}${String(seq).padStart(2, '0')}`;
        insert.run(generateId(), tenant.tenantId, property.id, num, unitType, fl);
      }
    });

    insertMany();
  }

  delete(tenantId, id) {
    const db = getDb();
    const existing = this.findById(tenantId, id);
    if (!existing) return null;
    const unitIds = db.prepare('SELECT id FROM units WHERE property_id = ? AND tenant_id = ?').all(id, tenantId).map(r=>r.id);
    db.pragma('foreign_keys = OFF');
    const del = db.transaction(() => {
      db.prepare('DELETE FROM receipts WHERE unit_id IN (' + unitIds.map(()=>'?').join(',') + ')').run(...unitIds);
      db.prepare('DELETE FROM payment_schedules WHERE contract_id IN (SELECT id FROM rental_contracts WHERE unit_id IN (' + unitIds.map(()=>'?').join(',') + '))').run(...unitIds);
      db.prepare('DELETE FROM rental_contracts WHERE unit_id IN (' + unitIds.map(()=>'?').join(',') + ')').run(...unitIds);
      db.prepare('DELETE FROM quotations WHERE unit_id IN (' + unitIds.map(()=>'?').join(',') + ') OR property_id = ?').run(...unitIds, id);
      db.prepare('DELETE FROM work_orders WHERE unit_id IN (' + unitIds.map(()=>'?').join(',') + ') OR property_id = ?').run(...unitIds, id);
      db.prepare('DELETE FROM utility_bills WHERE unit_id IN (' + unitIds.map(()=>'?').join(',') + ') OR property_id = ?').run(...unitIds, id);
      db.prepare('DELETE FROM purchase_orders WHERE property_id = ?').run(id);
      db.prepare('DELETE FROM stock_movements WHERE item_id IN (SELECT id FROM inventory_items WHERE property_id = ?)').run(id);
      db.prepare('DELETE FROM inventory_items WHERE property_id = ?').run(id);
      db.prepare('DELETE FROM units WHERE property_id = ? AND tenant_id = ?').run(id, tenantId);
      db.prepare('DELETE FROM properties WHERE id = ? AND tenant_id = ?').run(id, tenantId);
    });
    del();
    db.pragma('foreign_keys = ON');
    return { deleted: true, id };
  }
}

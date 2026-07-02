import { getDb } from '../db/database.js';
import { generateId } from './helpers.js';

export function listOwners(tenantId) {
  const db = getDb();
  const owners = db.prepare(`
    SELECT o.*,
      (SELECT COUNT(*) FROM property_ownership po WHERE po.owner_id = o.id) AS property_count,
      (SELECT COALESCE(SUM(os.gross_rent), 0) FROM owner_settlements os WHERE os.owner_id = o.id AND os.transfer_status = 'paid') AS total_received
    FROM owners o
    WHERE o.tenant_id = ?
    ORDER BY o.created_at DESC
  `).all(tenantId);
  return owners;
}

export function getOwner(tenantId, id) {
  const db = getDb();
  const owner = db.prepare(`SELECT * FROM owners WHERE id = ? AND tenant_id = ?`).get(id, tenantId);
  if (!owner) return null;

  const properties = db.prepare(`
    SELECT p.*, po.ownership_pct, po.management_fee_pct, po.is_primary
    FROM property_ownership po
    JOIN properties p ON p.id = po.property_id
    WHERE po.owner_id = ? AND po.tenant_id = ?
  `).all(id, tenantId);

  const settlements = db.prepare(`
    SELECT * FROM owner_settlements
    WHERE owner_id = ? AND tenant_id = ?
    ORDER BY created_at DESC LIMIT 12
  `).all(id, tenantId);

  return { ...owner, properties, settlements };
}

export function createOwner(tenantId, data) {
  const db = getDb();
  const id = generateId();
  db.prepare(`
    INSERT INTO owners (id, tenant_id, full_name_ar, full_name_en, national_id, id_type, phone, email,
      bank_name, bank_iban, bank_account_no, address, city, nationality,
      ownership_pct, management_fee_pct, contract_terms, notes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, tenantId, data.full_name_ar, data.full_name_en || data.full_name_ar,
    data.national_id || '', data.id_type || 'national',
    data.phone || '', data.email || '',
    data.bank_name || '', data.bank_iban || '', data.bank_account_no || '',
    data.address || '', data.city || 'ينبع', data.nationality || 'SA',
    data.ownership_pct || 100, data.management_fee_pct || 0,
    data.contract_terms || '', data.notes || '', data.status || 'active');
  return getOwner(tenantId, id);
}

export function updateOwner(tenantId, id, data) {
  const db = getDb();
  db.prepare(`
    UPDATE owners SET
      full_name_ar = ?, full_name_en = ?, national_id = ?, id_type = ?,
      phone = ?, email = ?, bank_name = ?, bank_iban = ?, bank_account_no = ?,
      address = ?, city = ?, nationality = ?,
      ownership_pct = ?, management_fee_pct = ?, contract_terms = ?, notes = ?, status = ?,
      updated_at = datetime('now')
    WHERE id = ? AND tenant_id = ?
  `).run(data.full_name_ar, data.full_name_en || data.full_name_ar,
    data.national_id || '', data.id_type || 'national',
    data.phone || '', data.email || '',
    data.bank_name || '', data.bank_iban || '', data.bank_account_no || '',
    data.address || '', data.city || 'ينبع', data.nationality || 'SA',
    data.ownership_pct || 100, data.management_fee_pct || 0,
    data.contract_terms || '', data.notes || '', data.status || 'active',
    id, tenantId);
  return getOwner(tenantId, id);
}

export function deleteOwner(tenantId, id) {
  const db = getDb();
  db.prepare(`DELETE FROM property_ownership WHERE owner_id = ? AND tenant_id = ?`).run(id, tenantId);
  db.prepare(`DELETE FROM owners WHERE id = ? AND tenant_id = ?`).run(id, tenantId);
  return { deleted: true };
}

export function linkProperty(tenantId, data) {
  const db = getDb();
  const existing = db.prepare(`SELECT id FROM property_ownership WHERE property_id = ? AND owner_id = ?`).get(data.property_id, data.owner_id);
  if (existing) {
    db.prepare(`UPDATE property_ownership SET ownership_pct = ?, management_fee_pct = ?, is_primary = ? WHERE id = ?`).run(
      data.ownership_pct || 100, data.management_fee_pct || 0, data.is_primary ? 1 : 0, existing.id);
    return { updated: true, id: existing.id };
  }
  const id = generateId();
  db.prepare(`
    INSERT INTO property_ownership (id, tenant_id, property_id, owner_id, ownership_pct, management_fee_pct, is_primary, start_date, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, tenantId, data.property_id, data.owner_id, data.ownership_pct || 100,
    data.management_fee_pct || 0, data.is_primary ? 1 : 0, data.start_date || null, data.notes || '');
  if (data.is_primary) {
    db.prepare(`UPDATE properties SET owner_id = ?, management_type = 'managed' WHERE id = ? AND tenant_id = ?`).run(data.owner_id, data.property_id, tenantId);
  }
  return { created: true, id };
}

export function unlinkProperty(tenantId, propertyId, ownerId) {
  const db = getDb();
  db.prepare(`DELETE FROM property_ownership WHERE property_id = ? AND owner_id = ? AND tenant_id = ?`).run(propertyId, ownerId, tenantId);
  const remaining = db.prepare(`SELECT COUNT(*) AS cnt FROM property_ownership WHERE property_id = ?`).get(propertyId);
  if (remaining.cnt === 0) {
    db.prepare(`UPDATE properties SET owner_id = NULL, management_type = 'owned' WHERE id = ? AND tenant_id = ?`).run(propertyId, tenantId);
  }
  return { deleted: true };
}

export function createSettlement(tenantId, data) {
  const db = getDb();
  const id = generateId();
  const net = (data.gross_rent || 0) - (data.management_fee || 0) - (data.maintenance_cost || 0) - (data.other_deductions || 0);
  db.prepare(`
    INSERT INTO owner_settlements (id, tenant_id, owner_id, settlement_period, gross_rent,
      management_fee, maintenance_cost, other_deductions, net_amount, transfer_status, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, tenantId, data.owner_id, data.settlement_period, data.gross_rent || 0,
    data.management_fee || 0, data.maintenance_cost || 0, data.other_deductions || 0,
    net, data.transfer_status || 'pending', data.notes || '', data.created_by || 'system');
  return db.prepare(`SELECT * FROM owner_settlements WHERE id = ?`).get(id);
}

export function listSettlements(tenantId, ownerId) {
  const db = getDb();
  let query = `SELECT os.*, o.full_name_ar AS owner_name FROM owner_settlements os JOIN owners o ON o.id = os.owner_id WHERE os.tenant_id = ?`;
  const params = [tenantId];
  if (ownerId) {
    query += ` AND os.owner_id = ?`;
    params.push(ownerId);
  }
  query += ` ORDER BY os.created_at DESC LIMIT 50`;
  return db.prepare(query).all(...params);
}

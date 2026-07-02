import { getDb } from '../db/database.js';
import { generateId } from './helpers.js';

export function listDeals(tenantId, filters = {}) {
  const db = getDb();
  let query = `SELECT d.*, p.name_ar AS property_name, u.unit_number, r.full_name_ar AS client_name_ref,
    a.full_name_ar AS agent_name, cr.full_name_ar AS created_by_name
    FROM deals d
    LEFT JOIN properties p ON p.id = d.property_id
    LEFT JOIN units u ON u.id = d.unit_id
    LEFT JOIN renters r ON r.id = d.client_id
    LEFT JOIN users a ON a.id = d.agent_id
    LEFT JOIN users cr ON cr.id = d.created_by
    WHERE d.tenant_id = ?`;
  const params = [tenantId];
  if (filters.stage) { query += ` AND d.stage = ?`; params.push(filters.stage); }
  if (filters.type) { query += ` AND d.deal_type = ?`; params.push(filters.type); }
  if (filters.agent_id) { query += ` AND d.agent_id = ?`; params.push(filters.agent_id); }
  query += ` ORDER BY d.created_at DESC LIMIT 200`;
  return db.prepare(query).all(...params);
}

export function getDeal(tenantId, id) {
  const db = getDb();
  const deal = db.prepare(`
    SELECT d.*, p.name_ar AS property_name, u.unit_number, r.full_name_ar AS client_name_ref,
      a.full_name_ar AS agent_name, cr.full_name_ar AS created_by_name
    FROM deals d
    LEFT JOIN properties p ON p.id = d.property_id
    LEFT JOIN units u ON u.id = d.unit_id
    LEFT JOIN renters r ON r.id = d.client_id
    LEFT JOIN users a ON a.id = d.agent_id
    LEFT JOIN users cr ON cr.id = d.created_by
    WHERE d.id = ? AND d.tenant_id = ?
  `).get(id, tenantId);
  if (!deal) return null;
  const activities = db.prepare(`
    SELECT da.*, u.full_name_ar AS created_by_name
    FROM deal_activities da LEFT JOIN users u ON u.id = da.created_by
    WHERE da.deal_id = ? ORDER BY da.activity_date DESC
  `).all(id);
  return { ...deal, activities };
}

export function createDeal(tenantId, data) {
  const db = getDb();
  const id = generateId();
  const dealNo = `D-${Date.now().toString(36).toUpperCase()}`;
  db.prepare(`
    INSERT INTO deals (id, tenant_id, deal_number, deal_type, lead_source, stage, property_id, unit_id,
      client_id, agent_id, client_name, client_phone, client_email,
      expected_value, commission_value, commission_pct, probability, expected_close_date, notes, assigned_to, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, tenantId, dealNo, data.deal_type || 'rent', data.lead_source || 'direct',
    data.stage || 'lead', data.property_id || null, data.unit_id || null,
    data.client_id || null, data.agent_id || null,
    data.client_name || '', data.client_phone || '', data.client_email || '',
    data.expected_value || 0, data.commission_value || 0, data.commission_pct || 0,
    data.probability || 10, data.expected_close_date || null, data.notes || '',
    data.assigned_to || data.agent_id || null, data.created_by || 'system');
  return getDeal(tenantId, id);
}

export function updateDeal(tenantId, id, data) {
  const db = getDb();
  const existing = getDeal(tenantId, id);
  if (!existing) throw new Error('الصفقة غير موجودة');
  db.prepare(`
    UPDATE deals SET deal_type=?, lead_source=?, stage=?, property_id=?, unit_id=?,
      client_id=?, agent_id=?, client_name=?, client_phone=?, client_email=?,
      expected_value=?, commission_value=?, commission_pct=?, probability=?,
      expected_close_date=?, closed_date=?, status_reason=?, notes=?, assigned_to=?,
      updated_at=datetime('now')
    WHERE id=? AND tenant_id=?
  `).run(data.deal_type || existing.deal_type, data.lead_source || existing.lead_source,
    data.stage || existing.stage, data.property_id || existing.property_id, data.unit_id || existing.unit_id,
    data.client_id || existing.client_id, data.agent_id || existing.agent_id,
    data.client_name !== undefined ? data.client_name : existing.client_name,
    data.client_phone !== undefined ? data.client_phone : existing.client_phone,
    data.client_email !== undefined ? data.client_email : existing.client_email,
    data.expected_value || existing.expected_value, data.commission_value || existing.commission_value,
    data.commission_pct || existing.commission_pct, data.probability || existing.probability,
    data.expected_close_date || existing.expected_close_date, data.closed_date || existing.closed_date,
    data.status_reason !== undefined ? data.status_reason : existing.status_reason,
    data.notes !== undefined ? data.notes : existing.notes,
    data.assigned_to || existing.assigned_to, id, tenantId);
  return getDeal(tenantId, id);
}

export function updateStage(tenantId, id, stage, reason) {
  const db = getDb();
  const validStages = ['lead','inquiry','viewing','negotiation','offer','signed','lost','cancelled'];
  if (!validStages.includes(stage)) throw new Error('مرحلة غير صالحة');
  const now = new Date().toISOString().split('T')[0];
  const data = { stage, status_reason: reason || null };
  if (stage === 'signed' || stage === 'lost' || stage === 'cancelled') data.closed_date = now;
  const existing = getDeal(tenantId, id);
  if (!existing) throw new Error('الصفقة غير موجودة');
  db.prepare(`UPDATE deals SET stage=?, status_reason=?, closed_date=COALESCE(?, closed_date), updated_at=datetime('now') WHERE id=? AND tenant_id=?`)
    .run(stage, reason || null, data.closed_date || null, id, tenantId);
  return getDeal(tenantId, id);
}

export function deleteDeal(tenantId, id) {
  const db = getDb();
  db.prepare(`DELETE FROM deals WHERE id=? AND tenant_id=?`).run(id, tenantId);
  return { deleted: true };
}

export function addActivity(tenantId, dealId, data) {
  const db = getDb();
  const id = generateId();
  db.prepare(`
    INSERT INTO deal_activities (id, deal_id, activity_type, description, activity_date, is_completed, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, dealId, data.activity_type, data.description, data.activity_date || new Date().toISOString().split('T')[0],
    data.is_completed ? 1 : 0, data.created_by || 'system');
  return db.prepare(`SELECT * FROM deal_activities WHERE id = ?`).get(id);
}

export function listCommissions(tenantId, filters = {}) {
  const db = getDb();
  let query = `SELECT c.*, d.deal_number, d.client_name AS deal_client, u.full_name_ar AS agent_name,
    ap.full_name_ar AS approved_by_name
    FROM commissions c
    LEFT JOIN deals d ON d.id = c.deal_id
    LEFT JOIN users u ON u.id = c.agent_id
    LEFT JOIN users ap ON ap.id = c.approved_by
    WHERE c.tenant_id = ?`;
  const params = [tenantId];
  if (filters.agent_id) { query += ` AND c.agent_id = ?`; params.push(filters.agent_id); }
  if (filters.status) { query += ` AND c.status = ?`; params.push(filters.status); }
  query += ` ORDER BY c.created_at DESC LIMIT 100`;
  return db.prepare(query).all(...params);
}

export function createCommission(tenantId, data) {
  const db = getDb();
  const id = generateId();
  let calculated = data.calculated_amount || 0;
  if (data.calculation_method === 'percentage' && data.base_amount && data.rate) {
    calculated = data.base_amount * (data.rate / 100);
  }
  db.prepare(`
    INSERT INTO commissions (id, tenant_id, deal_id, contract_id, agent_id, commission_type,
      calculation_method, base_amount, rate, calculated_amount, due_date, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, tenantId, data.deal_id || null, data.contract_id || null,
    data.agent_id, data.commission_type || 'sale', data.calculation_method || 'fixed',
    data.base_amount || 0, data.rate || 0, calculated, data.due_date || null,
    data.notes || '', data.created_by || 'system');
  return db.prepare(`SELECT * FROM commissions WHERE id = ?`).get(id);
}

export function updateCommissionStatus(tenantId, id, status, userId) {
  const db = getDb();
  const validStatuses = ['pending','approved','paid','cancelled'];
  if (!validStatuses.includes(status)) throw new Error('حالة غير صالحة');
  const data = {};
  if (status === 'paid') data.paid_date = new Date().toISOString().split('T')[0];
  const existing = db.prepare(`SELECT * FROM commissions WHERE id=? AND tenant_id=?`).get(id, tenantId);
  if (!existing) throw new Error('العمولة غير موجودة');
  db.prepare(`UPDATE commissions SET status=?, approved_by=COALESCE(?, approved_by), paid_date=COALESCE(?, paid_date), updated_at=datetime('now') WHERE id=? AND tenant_id=?`)
    .run(status, (status === 'approved' || status === 'paid') ? (userId || 'system') : null,
      data.paid_date || null, id, tenantId);
  return db.prepare(`SELECT * FROM commissions WHERE id = ?`).get(id);
}

export function dealAnalytics(tenantId) {
  const db = getDb();
  const stages = db.prepare(`
    SELECT stage, COUNT(*) AS count, COALESCE(SUM(expected_value), 0) AS total_value
    FROM deals WHERE tenant_id = ? GROUP BY stage
  `).all(tenantId);
  const total = stages.reduce((s, st) => s + st.count, 0);
  const pipeline = stages.reduce((s, st) => s + st.total_value, 0);
  const byAgent = db.prepare(`
    SELECT u.full_name_ar AS agent_name, COUNT(*) AS deals_count, COALESCE(SUM(d.expected_value), 0) AS total_value
    FROM deals d LEFT JOIN users u ON u.id = d.agent_id
    WHERE d.tenant_id = ? AND d.stage NOT IN ('lost','cancelled')
    GROUP BY d.agent_id ORDER BY total_value DESC
  `).all(tenantId);
  return { byStage: stages, total, pipeline_value: pipeline, byAgent };
}

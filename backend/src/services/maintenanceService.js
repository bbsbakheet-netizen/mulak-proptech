import { getDb } from '../db/database.js';
import { generateId } from './helpers.js';

const ticketFields = `id, tenant_id, ticket_number, property_id, unit_id, title, description,
  category_id, priority, status, reported_by, reported_by_name, reported_by_phone,
  assigned_to, owner_id, estimated_cost, actual_cost, cost_bearer,
  scheduled_date, completed_date, resolution_notes, created_at, updated_at`;

export function listTickets(tenantId, filters = {}) {
  const db = getDb();
  let query = `SELECT t.*, p.name_ar AS property_name, u.unit_number,
    cat.name_ar AS category_name, a.full_name_ar AS assigned_name
    FROM maintenance_tickets t
    LEFT JOIN properties p ON p.id = t.property_id
    LEFT JOIN units u ON u.id = t.unit_id
    LEFT JOIN maintenance_categories cat ON cat.id = t.category_id
    LEFT JOIN users a ON a.id = t.assigned_to
    WHERE t.tenant_id = ?`;
  const params = [tenantId];
  if (filters.status) { query += ` AND t.status = ?`; params.push(filters.status); }
  if (filters.priority) { query += ` AND t.priority = ?`; params.push(filters.priority); }
  if (filters.property_id) { query += ` AND t.property_id = ?`; params.push(filters.property_id); }
  if (filters.assigned_to) { query += ` AND t.assigned_to = ?`; params.push(filters.assigned_to); }
  query += ` ORDER BY t.created_at DESC LIMIT 200`;
  return db.prepare(query).all(...params);
}

export function getTicket(tenantId, id) {
  const db = getDb();
  const ticket = db.prepare(`
    SELECT t.*, p.name_ar AS property_name, u.unit_number,
      cat.name_ar AS category_name, a.full_name_ar AS assigned_name,
      r.full_name_ar AS reported_name
    FROM maintenance_tickets t
    LEFT JOIN properties p ON p.id = t.property_id
    LEFT JOIN units u ON u.id = t.unit_id
    LEFT JOIN maintenance_categories cat ON cat.id = t.category_id
    LEFT JOIN users a ON a.id = t.assigned_to
    LEFT JOIN users r ON r.id = t.reported_by
    WHERE t.id = ? AND t.tenant_id = ?
  `).get(id, tenantId);
  if (!ticket) return null;
  const activities = db.prepare(`
    SELECT a.*, u.full_name_ar AS created_by_name
    FROM maintenance_activities a LEFT JOIN users u ON u.id = a.created_by
    WHERE a.ticket_id = ? ORDER BY a.created_at DESC
  `).all(id);
  return { ...ticket, activities };
}

export function createTicket(tenantId, data) {
  const db = getDb();
  const id = generateId();
  const ticketNo = `MT-${Date.now().toString(36).toUpperCase()}`;
  db.prepare(`
    INSERT INTO maintenance_tickets (id, tenant_id, ticket_number, property_id, unit_id,
      title, description, category_id, priority, status, reported_by,
      reported_by_name, reported_by_phone, assigned_to, owner_id,
      estimated_cost, cost_bearer, scheduled_date, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, tenantId, ticketNo,
    data.property_id || null, data.unit_id || null,
    data.title, data.description || '', data.category_id || null,
    data.priority || 'medium', data.status || 'open',
    data.reported_by || null, data.reported_by_name || '', data.reported_by_phone || '',
    data.assigned_to || null, data.owner_id || null,
    data.estimated_cost || 0, data.cost_bearer || 'owner',
    data.scheduled_date || null, data.created_by || 'system');
  addActivity(tenantId, id, {
    description: 'تم إنشاء تذكرة الصيانة',
    activity_type: 'note',
    created_by: data.created_by || 'system'
  });
  return getTicket(tenantId, id);
}

export function updateTicket(tenantId, id, data) {
  const db = getDb();
  const existing = getTicket(tenantId, id);
  if (!existing) throw new Error('تذكرة الصيانة غير موجودة');
  db.prepare(`
    UPDATE maintenance_tickets SET
      property_id=?, unit_id=?, title=?, description=?, category_id=?,
      priority=?, status=?, reported_by_name=?, reported_by_phone=?,
      assigned_to=?, owner_id=?, estimated_cost=?, actual_cost=?,
      cost_bearer=?, scheduled_date=?, completed_date=?, resolution_notes=?,
      updated_at=datetime('now')
    WHERE id=? AND tenant_id=?
  `).run(
    data.property_id || existing.property_id, data.unit_id || existing.unit_id,
    data.title !== undefined ? data.title : existing.title,
    data.description !== undefined ? data.description : existing.description,
    data.category_id || existing.category_id,
    data.priority || existing.priority,
    data.status || existing.status,
    data.reported_by_name !== undefined ? data.reported_by_name : existing.reported_by_name,
    data.reported_by_phone !== undefined ? data.reported_by_phone : existing.reported_by_phone,
    data.assigned_to || existing.assigned_to, data.owner_id || existing.owner_id,
    data.estimated_cost || existing.estimated_cost, data.actual_cost || existing.actual_cost,
    data.cost_bearer || existing.cost_bearer,
    data.scheduled_date || existing.scheduled_date,
    data.completed_date || existing.completed_date,
    data.resolution_notes !== undefined ? data.resolution_notes : existing.resolution_notes,
    id, tenantId
  );
  return getTicket(tenantId, id);
}

export function updateTicketStatus(tenantId, id, status, userId) {
  const db = getDb();
  const validStatuses = ['open', 'assigned', 'in_progress', 'completed', 'cancelled'];
  if (!validStatuses.includes(status)) throw new Error('حالة غير صالحة');
  const existing = db.prepare(`SELECT * FROM maintenance_tickets WHERE id=? AND tenant_id=?`).get(id, tenantId);
  if (!existing) throw new Error('تذكرة الصيانة غير موجودة');
  const now = new Date().toISOString().split('T')[0];
  db.prepare(`
    UPDATE maintenance_tickets SET status=?, completed_date=CASE WHEN ?='completed' THEN COALESCE(completed_date, ?) ELSE completed_date END, updated_at=datetime('now')
    WHERE id=? AND tenant_id=?
  `).run(status, status, now, id, tenantId);
  addActivity(tenantId, id, {
    description: `تم تغيير الحالة من "${existing.status}" إلى "${status}"`,
    activity_type: 'status_change',
    old_value: existing.status,
    new_value: status,
    created_by: userId || 'system'
  });
  return getTicket(tenantId, id);
}

export function deleteTicket(tenantId, id) {
  const db = getDb();
  db.prepare(`DELETE FROM maintenance_tickets WHERE id=? AND tenant_id=?`).run(id, tenantId);
  return { deleted: true };
}

export function addActivity(tenantId, ticketId, data) {
  const db = getDb();
  const id = generateId();
  db.prepare(`
    INSERT INTO maintenance_activities (id, tenant_id, ticket_id, description, activity_type, old_value, new_value, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, tenantId, ticketId, data.description, data.activity_type || 'note',
    data.old_value || null, data.new_value || null, data.created_by || 'system');
  return db.prepare(`SELECT * FROM maintenance_activities WHERE id = ?`).get(id);
}

export function listCategories(tenantId) {
  const db = getDb();
  return db.prepare(`SELECT * FROM maintenance_categories WHERE tenant_id = ? ORDER BY name_ar`).all(tenantId);
}

export function createCategory(tenantId, data) {
  const db = getDb();
  const id = generateId();
  db.prepare(`INSERT INTO maintenance_categories (id, tenant_id, name_ar, name_en, icon) VALUES (?, ?, ?, ?, ?)`)
    .run(id, tenantId, data.name_ar, data.name_en || '', data.icon || '');
  return db.prepare(`SELECT * FROM maintenance_categories WHERE id = ?`).get(id);
}

export function seedCategories(tenantId) {
  const db = getDb();
  const existing = db.prepare(`SELECT COUNT(*) AS c FROM maintenance_categories WHERE tenant_id = ?`).get(tenantId);
  if (existing.c > 0) return;
  const cats = [
    { name_ar: 'سباكة', name_en: 'Plumbing', icon: 'droplet' },
    { name_ar: 'كهرباء', name_en: 'Electrical', icon: 'bolt' },
    { name_ar: 'تكييف', name_en: 'AC', icon: 'wind' },
    { name_ar: 'دهان', name_en: 'Painting', icon: 'brush' },
    { name_ar: 'نجارة', name_en: 'Carpentry', icon: 'hammer' },
    { name_ar: 'زجاج وواجهات', name_en: 'Glass & Facade', icon: 'grid' },
    { name_ar: 'نظافة', name_en: 'Cleaning', icon: 'spray' },
    { name_ar: 'أمن وسلامة', name_en: 'Safety', icon: 'shield' },
    { name_ar: 'مصاعد', name_en: 'Elevator', icon: 'arrow-up' },
    { name_ar: 'أخرى', name_en: 'Other', icon: 'more-horizontal' },
  ];
  const stmt = db.prepare(`INSERT INTO maintenance_categories (id, tenant_id, name_ar, name_en, icon) VALUES (?, ?, ?, ?, ?)`);
  for (const cat of cats) {
    stmt.run(generateId(), tenantId, cat.name_ar, cat.name_en, cat.icon);
  }
}

export function ticketAnalytics(tenantId) {
  const db = getDb();
  const byStatus = db.prepare(`
    SELECT status, COUNT(*) AS count FROM maintenance_tickets WHERE tenant_id = ? GROUP BY status
  `).all(tenantId);
  const byPriority = db.prepare(`
    SELECT priority, COUNT(*) AS count FROM maintenance_tickets WHERE tenant_id = ? GROUP BY priority
  `).all(tenantId);
  const total = byStatus.reduce((s, r) => s + r.count, 0);
  const open = (byStatus.find(r => r.status === 'open')?.count || 0) +
    (byStatus.find(r => r.status === 'assigned')?.count || 0) +
    (byStatus.find(r => r.status === 'in_progress')?.count || 0);
  const completed = byStatus.find(r => r.status === 'completed')?.count || 0;
  return { byStatus, byPriority, total, open, completed };
}

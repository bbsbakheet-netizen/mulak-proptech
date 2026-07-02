import { getDb } from '../db/database.js';
import { generateId, today } from './helpers.js';

export function checkAlerts(tenantId) {
  const db = getDb();
  const now = today();
  const alerts = [];

  // 1. Contracts expiring within 30 days
  const expiring = db.prepare(`
    SELECT rc.id, rc.contract_number, rc.end_date, rc.annual_rent,
      r.full_name_ar AS renter_name, u.unit_number, p.name_ar AS property_name
    FROM rental_contracts rc
    JOIN renters r ON r.id = rc.renter_id
    JOIN units u ON u.id = rc.unit_id
    JOIN properties p ON p.id = u.property_id
    WHERE rc.tenant_id = ? AND rc.status = 'active'
      AND rc.end_date BETWEEN ? AND date(?, '+30 days')
    ORDER BY rc.end_date
  `).all(tenantId, now, now);
  for (const c of expiring) {
    alerts.push({
      id: generateId(),
      type: 'contract_expiring',
      severity: 'warning',
      title: `عقد ${c.contract_number} ينتهي قريباً`,
      message: `عقد المستأجر ${c.renter_name} للوحدة ${c.unit_number} ينتهي في ${c.end_date}`,
      reference_id: c.id,
      reference_type: 'contract',
      due_date: c.end_date,
    });
  }

  // 2. Overdue maintenance tickets (older than 7 days, not completed)
  const overdueMaint = db.prepare(`
    SELECT mt.id, mt.ticket_number, mt.title, mt.created_at, mt.priority,
      p.name_ar AS property_name
    FROM maintenance_tickets mt
    LEFT JOIN properties p ON p.id = mt.property_id
    WHERE mt.tenant_id = ? AND mt.status NOT IN ('completed','cancelled')
      AND mt.created_at < date('now', '-7 days')
    ORDER BY mt.priority DESC, mt.created_at
  `).all(tenantId);
  for (const m of overdueMaint) {
    alerts.push({
      id: generateId(),
      type: 'maintenance_overdue',
      severity: m.priority === 'urgent' ? 'danger' : (m.priority === 'high' ? 'warning' : 'info'),
      title: `تذكرة صيانة ${m.ticket_number} متأخرة`,
      message: `${m.title} — ${m.property_name || ''} منذ ${m.created_at ? m.created_at.substring(0, 10) : ''}`,
      reference_id: m.id,
      reference_type: 'maintenance',
    });
  }

  // 3. Unpaid receipts (overdue)
  const unpaid = db.prepare(`
    SELECT ps.id, ps.contract_id, ps.installment_no, ps.due_date, ps.amount, ps.total_amount,
      rc.contract_number, r.full_name_ar AS renter_name
    FROM payment_schedules ps
    JOIN rental_contracts rc ON rc.id = ps.contract_id
    JOIN renters r ON r.id = rc.renter_id
    WHERE ps.tenant_id = ? AND ps.status = 'pending' AND ps.due_date < ?
    ORDER BY ps.due_date
    LIMIT 20
  `).all(tenantId, now);
  for (const u of unpaid) {
    alerts.push({
      id: generateId(),
      type: 'payment_overdue',
      severity: 'danger',
      title: `دفعة ${u.contract_number} متأخرة`,
      message: `القسط ${u.installment_no} — ${u.renter_name} — ${(u.total_amount || 0).toLocaleString('ar-SA')} — مستحق منذ ${u.due_date}`,
      reference_id: u.id,
      reference_type: 'payment',
      due_date: u.due_date,
    });
  }

  return alerts;
}

export function getAlertStats(tenantId) {
  const alerts = checkAlerts(tenantId);
  return {
    total: alerts.length,
    danger: alerts.filter(a => a.severity === 'danger').length,
    warning: alerts.filter(a => a.severity === 'warning').length,
    info: alerts.filter(a => a.severity === 'info').length,
    byType: {
      contract_expiring: alerts.filter(a => a.type === 'contract_expiring').length,
      maintenance_overdue: alerts.filter(a => a.type === 'maintenance_overdue').length,
      payment_overdue: alerts.filter(a => a.type === 'payment_overdue').length,
    },
  };
}

export function getDashboardAlerts(tenantId) {
  const alerts = checkAlerts(tenantId);
  return alerts.slice(0, 10);
}

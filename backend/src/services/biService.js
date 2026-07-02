import { getDb } from '../db/database.js';

export function getOccupancyRates(tenantId, branchId) {
  const db = getDb();
  const branchFilter = branchId ? `AND u.branch_id = ?` : '';
  const params = branchId ? [tenantId, branchId] : [tenantId];
  const units = db.prepare(`
    SELECT u.id, u.status, p.name_ar AS property_name, u.unit_number
    FROM units u JOIN properties p ON p.id = u.property_id
    WHERE u.tenant_id = ? ${branchFilter}
  `).all(...params);
  const total = units.length;
  const occupied = units.filter(u => u.status === 'occupied').length;
  const vacant = units.filter(u => u.status === 'vacant').length;
  const maintenance = units.filter(u => u.status === 'maintenance').length;
  const rate = total > 0 ? ((occupied / total) * 100).toFixed(1) : 0;
  const byProperty = {};
  for (const u of units) {
    if (!byProperty[u.property_name]) byProperty[u.property_name] = { total: 0, occupied: 0 };
    byProperty[u.property_name].total++;
    if (u.status === 'occupied') byProperty[u.property_name].occupied++;
  }
  const propertyBreakdown = Object.entries(byProperty).map(([name, d]) => ({
    name,
    total: d.total,
    occupied: d.occupied,
    rate: d.total > 0 ? ((d.occupied / d.total) * 100).toFixed(1) : 0,
  }));
  return { total, occupied, vacant, maintenance, rate: parseFloat(rate), propertyBreakdown };
}

export function getRevenueAnalytics(tenantId, year) {
  const db = getDb();
  const y = year || new Date().getFullYear();
  const monthly = db.prepare(`
    SELECT strftime('%m', payment_date) AS month,
      COALESCE(SUM(total_amount), 0) AS revenue,
      COALESCE(SUM(vat_amount), 0) AS vat
    FROM receipts
    WHERE tenant_id = ? AND strftime('%Y', payment_date) = ? AND is_cancelled = 0
    GROUP BY month ORDER BY month
  `).all(tenantId, String(y));
  const total = monthly.reduce((s, r) => s + r.revenue, 0);
  const avgMonthly = monthly.length > 0 ? (total / monthly.length) : 0;
  return { year: y, total, avg_monthly: avgMonthly, monthly, months_with_data: monthly.length };
}

export function getROI(tenantId) {
  const db = getDb();
  const properties = db.prepare(`
    SELECT p.id, p.name_ar, p.name_en, p.purchase_price, p.market_value,
      (SELECT COALESCE(SUM(r.total_amount), 0) FROM receipts r
       JOIN units u ON u.property_id = p.id
       WHERE r.unit_id = u.id AND r.tenant_id = p.tenant_id AND r.is_cancelled = 0
      ) AS total_revenue,
      (SELECT COUNT(*) FROM units WHERE property_id = p.id AND status = 'occupied') AS occupied_units,
      (SELECT COUNT(*) FROM units WHERE property_id = p.id) AS total_units
    FROM properties p WHERE p.tenant_id = ?
  `).all(tenantId);
  return properties.map(p => {
    const investment = p.purchase_price || p.market_value || 0;
    const annualReturn = p.total_revenue || 0;
    const roi = investment > 0 ? ((annualReturn / investment) * 100).toFixed(2) : 0;
    const occupancyRate = p.total_units > 0 ? ((p.occupied_units / p.total_units) * 100).toFixed(1) : 0;
    return {
      id: p.id,
      name: p.name_ar || p.name_en,
      investment,
      annual_revenue: annualReturn,
      roi: parseFloat(roi),
      occupancy_rate: parseFloat(occupancyRate),
      occupied_units: p.occupied_units,
      total_units: p.total_units,
    };
  });
}

export function getDashboardSummary(tenantId) {
  const db = getDb();
  const now = new Date().toISOString().split('T')[0];
  const month = now.substring(0, 7);
  const summary = {
    properties: db.prepare(`SELECT COUNT(*) AS c FROM properties WHERE tenant_id = ?`).get(tenantId).c,
    units: db.prepare(`SELECT COUNT(*) AS c FROM units WHERE tenant_id = ?`).get(tenantId).c,
    active_contracts: db.prepare(`SELECT COUNT(*) AS c FROM rental_contracts WHERE tenant_id = ? AND status = 'active'`).get(tenantId).c,
    total_receipts: db.prepare(`SELECT COALESCE(SUM(total_amount),0) AS t FROM receipts WHERE tenant_id = ? AND is_cancelled = 0`).get(tenantId).t,
    month_receipts: db.prepare(`SELECT COALESCE(SUM(total_amount),0) AS t FROM receipts WHERE tenant_id = ? AND strftime('%Y-%m', payment_date) = ? AND is_cancelled = 0`).get(tenantId, month).t,
    pending_maintenance: db.prepare(`SELECT COUNT(*) AS c FROM maintenance_tickets WHERE tenant_id = ? AND status NOT IN ('completed','cancelled')`).get(tenantId).c,
    expiring_contracts: db.prepare(`SELECT COUNT(*) AS c FROM rental_contracts WHERE tenant_id = ? AND status = 'active' AND end_date BETWEEN ? AND date(?, '+30 days')`).get(tenantId, now, now).c,
  };
  summary.occupancy = getOccupancyRates(tenantId);
  summary.roi = getROI(tenantId);
  summary.revenue = getRevenueAnalytics(tenantId);
  return summary;
}

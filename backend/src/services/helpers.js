import { v4 as uuidv4 } from 'uuid';

export function generateId() {
  return uuidv4();
}

export function generateContractNumber(tenantId, db) {
  const year = new Date().getFullYear();
  const row = db.prepare(`
    SELECT CAST(COALESCE(MAX(CAST(SUBSTR(contract_number, -5) AS INTEGER)), 0) + 1 AS INTEGER) AS seq
    FROM rental_contracts WHERE tenant_id = ?
  `).get(tenantId);
  const seq = String(row.seq || 1).padStart(5, '0');
  return `RC-${year}-${seq}`;
}

export function generateReceiptNumber(tenantId, db) {
  const year = new Date().getFullYear();
  const row = db.prepare(`
    SELECT CAST(COALESCE(MAX(CAST(SUBSTR(receipt_number, -5) AS INTEGER)), 0) + 1 AS INTEGER) AS seq
    FROM receipts WHERE tenant_id = ?
  `).get(tenantId);
  const seq = String(row.seq || 1).padStart(5, '0');
  return `RCP-${year}-${seq}`;
}

export function generateQuoteNumber(tenantId, db) {
  const year = new Date().getFullYear();
  const row = db.prepare(`
    SELECT CAST(COALESCE(MAX(CAST(SUBSTR(quote_number, -5) AS INTEGER)), 0) + 1 AS INTEGER) AS seq
    FROM quotations WHERE tenant_id = ?
  `).get(tenantId);
  const seq = String(row.seq || 1).padStart(5, '0');
  return `QT-${year}-${seq}`;
}

export function generateOrderNumber(tenantId, db) {
  const year = new Date().getFullYear();
  const row = db.prepare(`
    SELECT CAST(COALESCE(MAX(CAST(SUBSTR(order_number, -3) AS INTEGER)), 0) + 1 AS INTEGER) AS seq
    FROM work_orders WHERE tenant_id = ?
  `).get(tenantId);
  const seq = String(row.seq || 1).padStart(3, '0');
  return `WO-${year}-${seq}`;
}

export function generateEmployeeNumber(tenantId, db) {
  const row = db.prepare(`
    SELECT CAST(COALESCE(MAX(CAST(SUBSTR(employee_number, -4) AS INTEGER)), 0) + 1 AS INTEGER) AS seq
    FROM employees WHERE tenant_id = ?
  `).get(tenantId);
  const seq = String(row.seq || 1).padStart(4, '0');
  return `EMP-${seq}`;
}

export function generateOpContractNumber(tenantId, db) {
  const year = new Date().getFullYear();
  const row = db.prepare(`
    SELECT CAST(COALESCE(MAX(CAST(SUBSTR(contract_number, -5) AS INTEGER)), 0) + 1 AS INTEGER) AS seq
    FROM operational_contracts WHERE tenant_id = ?
  `).get(tenantId);
  const seq = String(row.seq || 1).padStart(5, '0');
  return `SV-${year}-${seq}`;
}

export function now() {
  return new Date().toISOString();
}

export function today() {
  return new Date().toISOString().split('T')[0];
}

export function paginate(query, params = {}, db) {
  const page = Math.max(1, parseInt(params.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(params.limit) || 50));
  const offset = (page - 1) * limit;
  return { limit, offset, page };
}

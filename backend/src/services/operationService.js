import { getDb } from '../db/database.js';
import { generateId, generateOpContractNumber, generateOrderNumber, now } from './helpers.js';

export class OperationService {
  createServiceContract(tenant, data) {
    const db = getDb();
    const id = generateId();
    const contractNumber = generateOpContractNumber(tenant.tenantId, db);

    db.prepare(`
      INSERT INTO operational_contracts (id, tenant_id, contract_number, property_id,
        service_type, vendor_name_ar, vendor_name_en, vendor_cr, vendor_vat,
        vendor_phone, vendor_email, start_date, end_date, annual_value,
        payment_frequency, scope_of_work_ar, scope_of_work_en,
        sla_response_hours, auto_renew, renewal_notice_days, cost_center, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, tenant.tenantId, contractNumber, data.property_id || null,
      data.service_type, data.vendor_name_ar, data.vendor_name_en || null,
      data.vendor_cr || null, data.vendor_vat || null,
      data.vendor_phone || null, data.vendor_email || null,
      data.start_date, data.end_date, data.annual_value || 0,
      data.payment_frequency || 'monthly', data.scope_of_work_ar || null,
      data.scope_of_work_en || null, data.sla_response_hours || 24,
      data.auto_renew ? 1 : 0, data.renewal_notice_days || 30,
      data.cost_center || null, data.notes || null
    );

    return db.prepare('SELECT * FROM operational_contracts WHERE id = ?').get(id);
  }

  findAllServiceContracts(tenantId) {
    const db = getDb();
    return db.prepare(`
      SELECT oc.*, p.name_ar AS property_name_ar
      FROM operational_contracts oc
      LEFT JOIN properties p ON p.id = oc.property_id
      WHERE oc.tenant_id = ?
      ORDER BY oc.created_at DESC
    `).all(tenantId);
  }

  createWorkOrder(tenant, data) {
    const db = getDb();
    const id = generateId();
    const orderNumber = generateOrderNumber(tenant.tenantId, db);

    db.prepare(`
      INSERT INTO work_orders (id, tenant_id, order_number, property_id, unit_id,
        op_contract_id, order_type, service_type, title_ar, title_en,
        description, priority, scheduled_date, assigned_to,
        estimated_cost, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, tenant.tenantId, orderNumber, data.property_id || null,
      data.unit_id || null, data.op_contract_id || null,
      data.order_type || 'corrective', data.service_type || null,
      data.title_ar, data.title_en || null, data.description || null,
      data.priority || 'medium', data.scheduled_date || null,
      data.assigned_to || null, data.estimated_cost || null,
      data.status || 'open'
    );

    return db.prepare('SELECT * FROM work_orders WHERE id = ?').get(id);
  }

  findAllWorkOrders(tenantId) {
    const db = getDb();
    return db.prepare(`
      SELECT wo.*, p.name_ar AS property_name_ar
      FROM work_orders wo
      LEFT JOIN properties p ON p.id = wo.property_id
      WHERE wo.tenant_id = ?
      ORDER BY wo.created_at DESC
    `).all(tenantId);
  }
}

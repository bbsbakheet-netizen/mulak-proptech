import { getDb } from '../db/database.js';
import { generateId, generateContractNumber, generateReceiptNumber, now, today } from './helpers.js';

export class ContractService {
  createDraft(tenant, data) {
    const db = getDb();
    const id = generateId();
    const contractNumber = generateContractNumber(tenant.tenantId, db);
    const annualRent = data.annual_rent || 0;
    const freq = data.payment_frequency || 'monthly';
    const installmentsCount = data.installments_count || (freq === 'monthly' ? 12 : freq === 'quarterly' ? 4 : freq === 'semi_annual' ? 2 : 1);

    db.prepare(`
      INSERT INTO rental_contracts (id, tenant_id, contract_number, unit_id, renter_id,
        start_date, end_date, annual_rent, security_deposit, payment_frequency,
        installments_count, grace_days, notes, special_conditions, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, tenant.tenantId, contractNumber, data.unit_id, data.renter_id,
      data.start_date, data.end_date, annualRent, data.security_deposit || 0,
      freq, installmentsCount, data.grace_days || 5,
      data.notes || null, data.special_conditions || null, tenant.userId
    );

    return db.prepare('SELECT * FROM rental_contracts WHERE id = ?').get(id);
  }

  activateContract(tenant, contractId) {
    const db = getDb();
    const contract = db.prepare(`
      SELECT rc.*, r.full_name_ar AS renter_name, r.phone AS renter_phone,
        u.unit_number, u.property_id, u.base_rent, p.name_ar AS property_name,
        r.id AS renter_id
      FROM rental_contracts rc
      JOIN units u ON u.id = rc.unit_id
      JOIN properties p ON p.id = u.property_id
      JOIN renters r ON r.id = rc.renter_id
      WHERE rc.id = ? AND rc.tenant_id = ?
    `).get(contractId, tenant.tenantId);

    if (!contract) throw { status: 404, message: 'Contract not found' };
    if (contract.status !== 'draft') throw { status: 400, message: 'Contract already activated' };

    // 1. Activate contract
    db.prepare('UPDATE rental_contracts SET status = ?, updated_at = ? WHERE id = ?')
      .run('active', now(), contractId);

    // 2. Mark unit as occupied
    db.prepare("UPDATE units SET status = 'occupied', updated_at = ? WHERE id = ?")
      .run(now(), contract.unit_id);

    // 3. Generate payment schedule (receipts are created individually on payment)
    this._generatePaymentSchedule(tenant, contract);

    const schedule = db.prepare(
      'SELECT * FROM payment_schedules WHERE contract_id = ? ORDER BY installment_no ASC'
    ).all(contractId);

    return {
      contract: db.prepare('SELECT * FROM rental_contracts WHERE id = ?').get(contractId),
      scheduleCount: schedule.length,
      receiptsGenerated: 0, // receipts are created on-demand when user pays
    };
  }

  getSchedule(tenantId, contractId) {
    const db = getDb();
    return db.prepare(
      'SELECT * FROM payment_schedules WHERE contract_id = ? AND tenant_id = ? ORDER BY installment_no ASC'
    ).all(contractId, tenantId);
  }

  getExpiring(tenantId) {
    const db = getDb();
    return db.prepare(`
      SELECT rc.*, u.unit_number, p.name_ar AS property_name_ar,
        p.name_en AS property_name_en, r.full_name_ar AS renter_name_ar,
        r.phone AS renter_phone,
        CAST(julianday(rc.end_date) - julianday('now') AS INTEGER) AS days_remaining
      FROM rental_contracts rc
      JOIN units u ON u.id = rc.unit_id
      JOIN properties p ON p.id = u.property_id
      JOIN renters r ON r.id = rc.renter_id
      WHERE rc.status = 'active' AND rc.tenant_id = ?
        AND rc.end_date BETWEEN date('now') AND date('now', '+60 days')
      ORDER BY rc.end_date
    `).all(tenantId);
  }

  getOverduePayments(tenantId) {
    const db = getDb();
    return db.prepare(`
      SELECT ps.*, rc.contract_number, u.unit_number, p.name_ar AS property_name_ar,
        r.full_name_ar AS renter_name_ar, r.phone AS renter_phone,
        CAST(julianday('now') - julianday(ps.due_date) AS INTEGER) AS days_overdue
      FROM payment_schedules ps
      JOIN rental_contracts rc ON rc.id = ps.contract_id
      JOIN units u ON u.id = rc.unit_id
      JOIN properties p ON p.id = u.property_id
      JOIN renters r ON r.id = rc.renter_id
      WHERE ps.status IN ('pending', 'partial') AND ps.tenant_id = ?
        AND ps.due_date < date('now')
      ORDER BY ps.due_date
    `).all(tenantId);
  }

  findById(tenantId, id) {
    const db = getDb();
    return db.prepare(`
      SELECT rc.*, u.unit_number, p.name_ar AS property_name_ar, p.name_en AS property_name_en,
        r.full_name_ar AS renter_name_ar, r.national_id
      FROM rental_contracts rc
      JOIN units u ON u.id = rc.unit_id
      JOIN properties p ON p.id = u.property_id
      JOIN renters r ON r.id = rc.renter_id
      WHERE rc.id = ? AND rc.tenant_id = ?
    `).get(id, tenantId) || null;
  }

  findAllContracts(tenantId, query = {}) {
    const db = getDb();
    let sql = `
      SELECT rc.*, u.unit_number, p.name_ar AS property_name_ar, p.name_en AS property_name_en,
        r.full_name_ar AS renter_name_ar, r.national_id
      FROM rental_contracts rc
      JOIN units u ON u.id = rc.unit_id
      JOIN properties p ON p.id = u.property_id
      JOIN renters r ON r.id = rc.renter_id
      WHERE rc.tenant_id = ?
    `;
    const params = [tenantId];

    if (query.status) {
      sql += ' AND rc.status = ?';
      params.push(query.status);
    }

    sql += ' ORDER BY rc.created_at DESC';
    return db.prepare(sql).all(...params);
  }

  updateIjarStatus(tenantId, contractId, data) {
    const db = getDb();
    db.prepare(`
      UPDATE rental_contracts SET ijar_contract_id = ?, ijar_status = ?, updated_at = ?
      WHERE id = ? AND tenant_id = ?
    `).run(data.ijar_contract_id || null, data.ijar_status || 'submitted', now(), contractId, tenantId);
    return db.prepare('SELECT * FROM rental_contracts WHERE id = ?').get(contractId);
  }

  updateNajizStatus(tenantId, contractId, data) {
    const db = getDb();
    db.prepare(`
      UPDATE rental_contracts SET najiz_contract_id = ?, najiz_status = ?, updated_at = ?
      WHERE id = ? AND tenant_id = ?
    `).run(data.najiz_contract_id || null, data.najiz_status || 'registered', now(), contractId, tenantId);
    return db.prepare('SELECT * FROM rental_contracts WHERE id = ?').get(contractId);
  }

  _generatePaymentSchedule(tenant, contract) {
    const db = getDb();
    const intervalMonths = contract.payment_frequency === 'monthly' ? 1
      : contract.payment_frequency === 'quarterly' ? 3
      : contract.payment_frequency === 'semi_annual' ? 6 : 12;

    const amount = contract.annual_rent / contract.installments_count;
    const startDate = new Date(contract.start_date);

    const insert = db.prepare(`
      INSERT INTO payment_schedules (id, tenant_id, contract_id, installment_no, due_date, amount)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const generate = db.transaction(() => {
      for (let i = 1; i <= contract.installments_count; i++) {
        const due = new Date(startDate);
        due.setMonth(due.getMonth() + (i - 1) * intervalMonths);
        const dueStr = due.toISOString().split('T')[0];
        insert.run(generateId(), tenant.tenantId, contract.id, i, dueStr, amount);
      }
    });

    generate();
  }

  // _bulkCreateReceipts removed — receipts are created on-demand when user records payment
}

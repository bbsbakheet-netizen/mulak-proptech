import { getDb } from '../db/database.js';
import { generateId, generateReceiptNumber, now, today } from './helpers.js';

export class ReceiptService {
  create(tenant, data) {
    const db = getDb();
    const id = generateId();
    const receiptNumber = generateReceiptNumber(tenant.tenantId, db);
    const vatAmount = data.vat_amount ?? Math.round(data.amount * 0.15);
    const totalAmount = data.total_amount ?? (data.amount + vatAmount);

    db.prepare(`
      INSERT INTO receipts (id, tenant_id, receipt_number, contract_id, schedule_id,
        renter_id, unit_id, amount, vat_amount, total_amount, payment_date,
        payment_method, reference_no, description_ar, description_en, approval_status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, tenant.tenantId, receiptNumber, data.contract_id || null,
      data.schedule_id || null, data.renter_id || null, data.unit_id || null,
      data.amount, vatAmount, totalAmount, data.payment_date || today(),
      data.payment_method || 'bank_transfer', data.reference_no || null,
      data.description_ar || null, data.description_en || null,
      'pending', tenant.userId
    );

    return db.prepare('SELECT * FROM receipts WHERE id = ?').get(id);
  }

  /**
   * Create receipt from a payment schedule item (called when tenant pays)
   */
  createFromSchedule(tenant, scheduleId) {
    const db = getDb();
    const schedule = db.prepare(`
      SELECT ps.*, rc.contract_number, rc.renter_id, rc.unit_id, rc.id AS contract_id,
        u.unit_number, p.name_ar AS property_name
      FROM payment_schedules ps
      JOIN rental_contracts rc ON rc.id = ps.contract_id
      JOIN units u ON u.id = rc.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE ps.id = ? AND ps.tenant_id = ?
    `).get(scheduleId, tenant.tenantId);
    if (!schedule) throw { status: 404, message: 'Payment schedule not found' };
    if (schedule.status === 'paid') throw { status: 400, message: 'Already paid' };

    const id = generateId();
    const receiptNumber = generateReceiptNumber(tenant.tenantId, db);
    const vatAmount = Math.round(schedule.amount * 0.15);
    const totalAmount = schedule.amount + vatAmount;

    const descAr = `إيجار - دفعة ${schedule.installment_no} - ${schedule.contract_number} - ${schedule.unit_number}`;
    const descEn = `Rent - Installment ${schedule.installment_no} - ${schedule.contract_number} - ${schedule.unit_number}`;
    db.prepare(`
      INSERT INTO receipts (id, tenant_id, receipt_number, contract_id, schedule_id,
        renter_id, unit_id, amount, vat_amount, total_amount, payment_date,
        payment_method, description_ar, description_en, approval_status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, tenant.tenantId, receiptNumber, schedule.contract_id, schedule.id,
      schedule.renter_id, schedule.unit_id, schedule.amount,
      vatAmount, totalAmount, today(), 'bank_transfer',
      descAr, descEn, 'pending', tenant.userId
    );

    return db.prepare(`
      SELECT r.*, rc.contract_number, u.unit_number, p.name_ar AS property_name
      FROM receipts r
      LEFT JOIN rental_contracts rc ON rc.id = r.contract_id
      LEFT JOIN units u ON u.id = r.unit_id
      LEFT JOIN properties p ON p.id = u.property_id
      WHERE r.id = ?
    `).get(id);
  }

  generateDueReceipts(tenant) {
    const db = getDb();
    const dueSchedules = db.prepare(`
      SELECT ps.*, rc.contract_number, rc.renter_id, rc.unit_id, rc.id AS contract_id,
        u.unit_number, p.name_ar AS property_name
      FROM payment_schedules ps
      JOIN rental_contracts rc ON rc.id = ps.contract_id
      JOIN units u ON u.id = rc.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE ps.tenant_id = ? AND ps.status = 'pending' AND ps.due_date <= ?
        AND ps.id NOT IN (SELECT schedule_id FROM receipts WHERE schedule_id IS NOT NULL AND approval_status != 'rejected')
    `).all(tenant.tenantId, today());
    let count = 0;
    dueSchedules.forEach(s => {
      const id = generateId();
      const receiptNumber = generateReceiptNumber(tenant.tenantId, db);
      const vatAmount = Math.round(s.amount * 0.15);
      const totalAmount = s.amount + vatAmount;
      const descAr = `إيجار - دفعة ${s.installment_no} - ${s.contract_number} - ${s.unit_number}`;
      db.prepare(`
        INSERT INTO receipts (id, tenant_id, receipt_number, contract_id, schedule_id,
          renter_id, unit_id, amount, vat_amount, total_amount, payment_date,
          payment_method, description_ar, description_en, approval_status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, tenant.tenantId, receiptNumber, s.contract_id, s.id,
        s.renter_id, s.unit_id, s.amount, vatAmount, totalAmount, today(),
        'bank_transfer', descAr, null, 'pending', tenant.userId);
      count++;
    });
    return { generated: count };
  }

  findAll(tenantId, query = {}) {
    const db = getDb();
    let sql = `
      SELECT r.*, rc.contract_number, u.unit_number, p.name_ar AS property_name,
        rnt.full_name_ar AS renter_name
      FROM receipts r
      LEFT JOIN rental_contracts rc ON rc.id = r.contract_id
      LEFT JOIN units u ON u.id = r.unit_id
      LEFT JOIN properties p ON p.id = u.property_id
      LEFT JOIN renters rnt ON rnt.id = r.renter_id
      WHERE r.tenant_id = ?
    `;
    const params = [tenantId];

    if (query.contract_id) {
      sql += ' AND r.contract_id = ?';
      params.push(query.contract_id);
    }
    if (query.zatca_status) {
      sql += ' AND r.zatca_status = ?';
      params.push(query.zatca_status);
    }
    if (query.approval_status) {
      sql += ' AND r.approval_status = ?';
      params.push(query.approval_status);
    }

    sql += ' ORDER BY r.created_at DESC';
    if (query.limit) {
      sql += ' LIMIT ?';
      params.push(parseInt(query.limit));
    }

    return db.prepare(sql).all(...params);
  }

  getPending(tenantId) {
    return this.findAll(tenantId, { approval_status: 'pending' });
  }

  approve(tenantId, receiptId, userId) {
    const db = getDb();
    const receipt = db.prepare('SELECT * FROM receipts WHERE id = ? AND tenant_id = ?').get(receiptId, tenantId);
    if (!receipt) throw { status: 404, message: 'Receipt not found' };
    if (receipt.approval_status !== 'pending') throw { status: 400, message: `Receipt already ${receipt.approval_status}` };

    // Auto-approve with ZATCA QR generation
    const update = db.transaction(() => {
      db.prepare(`
        UPDATE receipts SET approval_status = 'approved', approved_at = ?, approved_by = ?
        WHERE id = ? AND tenant_id = ?
      `).run(now(), userId || null, receiptId, tenantId);

      // Mark payment schedule as paid if linked
      if (receipt.schedule_id) {
        db.prepare(`
          UPDATE payment_schedules SET status = 'paid', paid_amount = ?, paid_date = ?,
            payment_method = ?, receipt_id = ?
          WHERE id = ? AND tenant_id = ? AND status != 'paid'
        `).run(receipt.amount, today(), receipt.payment_method, receiptId, receipt.schedule_id, tenantId);
      }

      // Auto-generate ZATCA QR
      this._generateAndStoreQr(tenantId, receiptId);
    });
    update();

    return db.prepare('SELECT * FROM receipts WHERE id = ?').get(receiptId);
  }

  _generateAndStoreQr(tenantId, receiptId) {
    const db = getDb();
    const receipt = db.prepare(`
      SELECT r.*, t.name_ar AS tenant_name, t.vat_number
      FROM receipts r
      LEFT JOIN tenants t ON t.id = r.tenant_id
      WHERE r.id = ? AND r.tenant_id = ?
    `).get(receiptId, tenantId);
    if (!receipt) return;

    const sellerName = receipt.tenant_name || 'مُلاك العقارية';
    const vatNumber = receipt.vat_number || '300000000000003';
    const timestamp = receipt.payment_date + 'T' + (receipt.created_at?.split('T')[1] || '00:00:00');
    const total = receipt.total_amount.toFixed(2);
    const vatTotal = receipt.vat_amount.toFixed(2);

    function tlv(tag, value) {
      const encoded = new TextEncoder().encode(value);
      const len = encoded.length;
      return String.fromCharCode(tag) + String.fromCharCode(len) + value;
    }
    const tlvData = tlv(1, sellerName) + tlv(2, vatNumber) + tlv(3, timestamp) + tlv(4, total) + tlv(5, vatTotal);
    const base64Tlv = Buffer.from(tlvData, 'latin1').toString('base64');

    db.prepare('UPDATE receipts SET zatca_qr_code = ?, zatca_status = ?, zatca_submitted_at = ? WHERE id = ?')
      .run(base64Tlv, 'reported', now(), receiptId);
  }

  markZatcaReported(tenantId, receiptId) {
    const db = getDb();
    db.prepare(`
      UPDATE receipts SET zatca_status = 'reported', zatca_submitted_at = ? WHERE id = ? AND tenant_id = ?
    `).run(now(), receiptId, tenantId);
    return db.prepare('SELECT * FROM receipts WHERE id = ?').get(receiptId);
  }

  generateZatcaQr(tenantId, receiptId) {
    this._generateAndStoreQr(tenantId, receiptId);
    const db = getDb();
    const r = db.prepare('SELECT zatca_qr_code FROM receipts WHERE id = ?').get(receiptId);
    return r ? { zatca_qr_code: r.zatca_qr_code } : null;
  }

  registerNajiz(tenantId, receiptId, najizRef) {
    const db = getDb();
    const result = db.prepare(`
      UPDATE receipts SET najiz_ref = ?, najiz_status = 'registered' WHERE id = ? AND tenant_id = ?
    `).run(najizRef || ('NJZ-RCP-' + Date.now()), receiptId, tenantId);
    if (result.changes === 0) return null;
    return db.prepare('SELECT * FROM receipts WHERE id = ?').get(receiptId);
  }
}
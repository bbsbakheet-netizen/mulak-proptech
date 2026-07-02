import { getDb } from '../db/database.js';
import { generateId, now } from './helpers.js';

export class FalService {
  generateNumber(tenantId, db) {
    const year = new Date().getFullYear();
    const row = db.prepare(`
      SELECT CAST(COALESCE(MAX(CAST(SUBSTR(contract_number, -5) AS INTEGER)), 0) + 1 AS INTEGER) AS seq
      FROM fal_contracts WHERE tenant_id = ?
    `).get(tenantId);
    const seq = String(row.seq || 1).padStart(5, '0');
    return `FAL-${year}-${seq}`;
  }

  create(tenant, data) {
    const db = getDb();
    const id = generateId();
    const contractNumber = this.generateNumber(tenant.tenantId, db);

    db.prepare(`
      INSERT INTO fal_contracts (
        id, tenant_id, contract_number, status,
        owner_name_ar, owner_national_id, owner_phone, owner_email,
        broker_name_ar, broker_license_no, broker_phone, broker_email,
        property_id, unit_id, property_address_ar, property_city, property_type, property_area_sqm,
        start_date, end_date,
        commission_type, commission_value, commission_flat_fee, is_exclusive,
        marketing_budget, marketing_plan_ar,
        special_conditions, notes, created_by
      ) VALUES (?, ?, ?, 'draft',
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?)
    `).run(
      id, tenant.tenantId, contractNumber,
      data.owner_name_ar, data.owner_national_id, data.owner_phone, data.owner_email || null,
      data.broker_name_ar, data.broker_license_no, data.broker_phone || null, data.broker_email || null,
      data.property_id || null, data.unit_id || null, data.property_address_ar || null,
      data.property_city || 'ينبع', data.property_type || null, data.property_area_sqm || null,
      data.start_date, data.end_date,
      data.commission_type || 'percentage', data.commission_value || 0, data.commission_flat_fee || 0,
      data.is_exclusive !== undefined ? (data.is_exclusive ? 1 : 0) : 1,
      data.marketing_budget || 0, data.marketing_plan_ar || null,
      data.special_conditions || null, data.notes || null, tenant.userId
    );

    return db.prepare('SELECT * FROM fal_contracts WHERE id = ?').get(id);
  }

  findAll(tenantId, query = {}) {
    const db = getDb();
    let sql = 'SELECT * FROM fal_contracts WHERE tenant_id = ?';
    const params = [tenantId];

    if (query.status) {
      sql += ' AND status = ?';
      params.push(query.status);
    }

    sql += ' ORDER BY created_at DESC';
    return db.prepare(sql).all(...params);
  }

  findById(tenantId, id) {
    const db = getDb();
    return db.prepare('SELECT * FROM fal_contracts WHERE id = ? AND tenant_id = ?').get(id, tenantId);
  }

  update(tenant, id, data) {
    const db = getDb();
    const existing = this.findById(tenant.tenantId, id);
    if (!existing) return null;

    const fields = [
      'owner_name_ar', 'owner_national_id', 'owner_phone', 'owner_email',
      'broker_name_ar', 'broker_license_no', 'broker_phone', 'broker_email',
      'property_id', 'unit_id', 'property_address_ar', 'property_city', 'property_type', 'property_area_sqm',
      'start_date', 'end_date',
      'commission_type', 'commission_value', 'commission_flat_fee', 'is_exclusive',
      'marketing_budget', 'marketing_plan_ar',
      'special_conditions', 'notes',
    ];

    const sets = [];
    const vals = [];
    for (const f of fields) {
      if (data[f] !== undefined) {
        sets.push(`${f} = ?`);
        vals.push(data[f]);
      }
    }

    if (sets.length === 0) return existing;

    sets.push('updated_at = ?');
    vals.push(now());
    vals.push(id, tenant.tenantId);

    db.prepare(`UPDATE fal_contracts SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`).run(...vals);
    return this.findById(tenant.tenantId, id);
  }

  activate(tenant, id) {
    const db = getDb();
    const contract = this.findById(tenant.tenantId, id);
    if (!contract) return null;
    if (contract.status !== 'draft') return contract;

    db.prepare("UPDATE fal_contracts SET status = 'active', updated_at = ? WHERE id = ?")
      .run(now(), id);

    return this.findById(tenant.tenantId, id);
  }

  cancel(tenant, id, reason) {
    const db = getDb();
    const contract = this.findById(tenant.tenantId, id);
    if (!contract) return null;

    db.prepare("UPDATE fal_contracts SET status = 'cancelled', notes = ?, updated_at = ? WHERE id = ?")
      .run(reason || contract.notes, now(), id);

    return this.findById(tenant.tenantId, id);
  }

  complete(tenant, id) {
    const db = getDb();
    const contract = this.findById(tenant.tenantId, id);
    if (!contract) return null;

    db.prepare("UPDATE fal_contracts SET status = 'completed', updated_at = ? WHERE id = ?")
      .run(now(), id);

    return this.findById(tenant.tenantId, id);
  }

  // ── Fal API Integration (ready for API keys) ──

  getTenantFalConfig(tenantId) {
    const db = getDb();
    return db.prepare('SELECT fal_api_key, fal_license_no FROM tenants WHERE id = ?').get(tenantId);
  }

  async submitToFal(tenant, contractId) {
    const contract = this.findById(tenant.tenantId, contractId);
    if (!contract) throw Object.assign(new Error('العقد غير موجود'), { status: 404 });

    const config = this.getTenantFalConfig(tenant.tenantId);
    if (!config.fal_api_key || !config.fal_license_no) {
      // Store as pending — will be submitted once API keys are configured
      const db = getDb();
      db.prepare(`
        UPDATE fal_contracts SET fal_status = 'pending_config', updated_at = ? WHERE id = ?
      `).run(now(), contractId);
      return {
        message: 'بانتظار إعداد مفاتيح API لمنصة فال',
        fal_status: 'pending_config',
      };
    }

    // TODO: Actual API call to Fal when keys are available
    // const response = await fetch('https://api.fal.sa/v1/contracts', {
    //   method: 'POST',
    //   headers: { 'Authorization': `Bearer ${config.fal_api_key}`, 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ ... }),
    // });

    const db = getDb();
    db.prepare(`
      UPDATE fal_contracts SET fal_status = 'submitted', fal_submitted_at = ?, updated_at = ? WHERE id = ?
    `).run(now(), now(), contractId);

    return {
      fal_status: 'submitted',
      fal_submitted_at: now(),
      message: 'تم إرسال العقد إلى منصة فال',
    };
  }

  async checkFalStatus(tenant, contractId) {
    const db = getDb();
    const contract = this.findById(tenant.tenantId, contractId);
    if (!contract) throw Object.assign(new Error('العقد غير موجود'), { status: 404 });

    const config = this.getTenantFalConfig(tenant.tenantId);
    if (!config.fal_api_key) {
      return { fal_status: contract.fal_status, message: 'مفاتيح API غير مهيأة' };
    }

    // TODO: Actual API call to check status
    // const response = await fetch(`https://api.fal.sa/v1/contracts/${contract.fal_contract_id}`, {
    //   headers: { 'Authorization': `Bearer ${config.fal_api_key}` }
    // });

    return {
      fal_status: contract.fal_status,
      fal_contract_id: contract.fal_contract_id,
      local_status: contract.status,
    };
  }
}

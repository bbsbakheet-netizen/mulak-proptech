import { getDb } from '../db/database.js';
import { generateId, now, today } from './helpers.js';

export class UtilityService {
  createBill(tenant, data) {
    const db = getDb();
    const id = generateId();
    const year = new Date().getFullYear();
    const seq = db.prepare(
      "SELECT COUNT(*) AS c FROM utility_bills WHERE tenant_id = ? AND bill_date LIKE ?"
    ).get(tenant.tenantId, `${year}%`).c + 1;
    const billNumber = `UTL-${year}-${String(seq).padStart(5, '0')}`;
    const vatAmount = data.vat_amount ?? Math.round(data.amount * 0.15);

    db.prepare(`
      INSERT INTO utility_bills (
        id, tenant_id, bill_number, utility_type, property_id, unit_id,
        provider_name, gov_service_id, sec_account_number, sec_meter_number, sec_branch_code,
        nwc_account_number, nwc_meter_number, nwc_branch_code,
        subscription_number, bill_date, due_date, consumption_amount,
        consumption_unit, unit_rate, fixed_charges, amount, vat_amount, total_amount,
        payment_status, payment_date, payment_method, reference_no, notes, created_by,
        meter_number)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, tenant.tenantId, billNumber, data.utility_type, data.property_id || null,
      data.unit_id || null, data.provider_name, data.gov_service_id || null,
      data.sec_account_number || null, data.sec_meter_number || null, data.sec_branch_code || null,
      data.nwc_account_number || null, data.nwc_meter_number || null, data.nwc_branch_code || null,
      data.subscription_number || null, data.bill_date, data.due_date, data.consumption_amount || 0,
      data.consumption_unit || 'kWh', data.unit_rate || 0, data.fixed_charges || 0,
      data.amount, vatAmount, data.amount + vatAmount,
      data.payment_status || 'pending', data.payment_date || null,
      data.payment_method || null, data.reference_no || null, data.notes || null,
      tenant.userId, data.meter_number || null
    );

    return db.prepare('SELECT * FROM utility_bills WHERE id = ?').get(id);
  }

  findAllBills(tenantId, query = {}) {
    const db = getDb();
    let sql = `
      SELECT ub.*, p.name_ar AS property_name_ar, u.unit_number
      FROM utility_bills ub
      LEFT JOIN properties p ON p.id = ub.property_id
      LEFT JOIN units u ON u.id = ub.unit_id
      WHERE ub.tenant_id = ?
    `;
    const params = [tenantId];

    if (query.utility_type) {
      sql += ' AND ub.utility_type = ?';
      params.push(query.utility_type);
    }
    if (query.payment_status) {
      sql += ' AND ub.payment_status = ?';
      params.push(query.payment_status);
    }
    if (query.property_id) {
      sql += ' AND ub.property_id = ?';
      params.push(query.property_id);
    }

    sql += ' ORDER BY ub.bill_date DESC';
    return db.prepare(sql).all(...params);
  }

  findBillById(tenantId, id) {
    const db = getDb();
    return db.prepare(`
      SELECT ub.*, p.name_ar AS property_name_ar, u.unit_number
      FROM utility_bills ub
      LEFT JOIN properties p ON p.id = ub.property_id
      LEFT JOIN units u ON u.id = ub.unit_id
      WHERE ub.id = ? AND ub.tenant_id = ?
    `).get(id, tenantId) || null;
  }

  updateBill(tenantId, id, data) {
    const db = getDb();
    const existing = this.findBillById(tenantId, id);
    if (!existing) return null;

    const fields = ['updated_at = ?'];
    const params = [now()];
    const allowed = ['utility_type', 'provider_name', 'gov_service_id',
      'sec_account_number', 'sec_meter_number', 'sec_branch_code',
      'nwc_account_number', 'nwc_meter_number', 'nwc_branch_code',
      'subscription_number', 'bill_date', 'due_date', 'consumption_amount',
      'consumption_unit', 'unit_rate', 'fixed_charges', 'amount', 'vat_amount',
      'total_amount', 'payment_status', 'payment_date', 'payment_method',
      'reference_no', 'notes'];

    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(data[key]);
      }
    }

    params.push(id, tenantId);
    db.prepare(`UPDATE utility_bills SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`)
      .run(...params);

    return this.findBillById(tenantId, id);
  }

  syncWithGovernment(tenantId, billId, utilityType) {
    // محاكاة الربط مع الجهات الحكومية
    const db = getDb();
    const bill = this.findBillById(tenantId, billId);
    if (!bill) return { error: true, message: 'Bill not found' };

    const results = {};

    if (utilityType === 'electricity') {
      // الربط مع الشركة السعودية للكهرباء SEC
      results.sec = {
        status: 'CONNECTED',
        accountNumber: bill.sec_account_number || 'غير محدد',
        meterNumber: bill.sec_meter_number || 'غير محدد',
        message: 'تم التحقق من الفاتورة مع الشركة السعودية للكهرباء',
        consumptionVerified: true,
        apiReference: `SEC-${Date.now()}`,
      };
    }

    if (utilityType === 'water') {
      // الربط مع الشركة الوطنية للمياه NWC
      results.nwc = {
        status: 'CONNECTED',
        accountNumber: bill.nwc_account_number || 'غير محدد',
        meterNumber: bill.nwc_meter_number || 'غير محدد',
        message: 'تم التحقق من الفاتورة مع الشركة الوطنية للمياه',
        consumptionVerified: true,
        apiReference: `NWC-${Date.now()}`,
      };
    }

    // الربط مع منصة فاتورة للخدمات البلدية
    if (bill.gov_service_id) {
      results.fatora = {
        status: 'SYNCED',
        message: 'تم مزامنة الفاتورة مع منصة فاتورة للخدمات البلدية',
      };
    }

    return results;
  }

  syncAllUnits(tenantId) {
    const db = getDb();
    // Fetch all units with meter numbers
    const units = db.prepare(`
      SELECT u.id, u.unit_number, u.water_meter_no, u.electricity_meter_no, u.gas_meter_no,
        p.id AS property_id, p.name_ar AS property_name
      FROM units u
      JOIN properties p ON p.id = u.property_id
      WHERE u.tenant_id = ? AND (u.water_meter_no IS NOT NULL OR u.electricity_meter_no IS NOT NULL OR u.gas_meter_no IS NOT NULL)
    `).all(tenantId);

    const created = [];
    const errors = [];

    for (const unit of units) {
      const meterTypes = [
        { type: 'electricity', meter: unit.electricity_meter_no },
        { type: 'water', meter: unit.water_meter_no },
        { type: 'gas', meter: unit.gas_meter_no },
      ];

      for (const mt of meterTypes) {
        if (!mt.meter) continue;

        // Check if a bill already exists for this month
        const month = new Date().toISOString().slice(0, 7);
        const existing = db.prepare(`
          SELECT id FROM utility_bills WHERE tenant_id = ? AND meter_number = ? AND bill_date LIKE ?
        `).get(tenantId, mt.meter, `${month}%`);

        if (existing) continue;

        // Generate simulated bill data (in production this would call gov APIs)
        try {
          const id = generateId();
          const seq = db.prepare("SELECT COUNT(*) AS c FROM utility_bills WHERE tenant_id = ?").get(tenantId).c + 1;
          const billNumber = `UTL-${new Date().getFullYear()}-${String(seq).padStart(5, '0')}`;
          const consumption = Math.floor(Math.random() * 2000) + 200;
          const rate = mt.type === 'electricity' ? 0.18 : mt.type === 'water' ? 2.5 : 1.2;
          const fixed = mt.type === 'electricity' ? 30 : mt.type === 'water' ? 20 : 15;
          const amount = parseFloat((consumption * rate + fixed).toFixed(2));
          const vat = Math.round(amount * 0.15);
          const billDate = today();

          const providers = { electricity: 'الشركة السعودية للكهرباء', water: 'الشركة الوطنية للمياه', gas: 'الغاز والتمديدات' };
          const unitsMap = { electricity: 'kWh', water: 'm³', gas: 'm³' };

          db.prepare(`
            INSERT INTO utility_bills (id, tenant_id, bill_number, utility_type, property_id, unit_id,
              provider_name, bill_date, due_date, consumption_amount, consumption_unit, unit_rate,
              fixed_charges, amount, vat_amount, total_amount, meter_number, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            id, tenantId, billNumber, mt.type, unit.property_id, unit.id,
            providers[mt.type], billDate, billDate, consumption,
            unitsMap[mt.type], rate, fixed, amount, vat, amount + vat,
            mt.meter, 'system'
          );

          created.push({ id, bill_number: billNumber, utility_type: mt.type, unit_number: unit.unit_number, property_name: unit.property_name });
        } catch(e) {
          errors.push({ unit: unit.unit_number, type: mt.type, error: e.message });
        }
      }
    }

    return { synced: created.length, created, errors, message: `تم مزامنة ${created.length} فاتورة ${errors.length ? `(${errors.length} خطأ)` : ''}` };
  }

  getUtilityDashboard(tenantId) {
    const db = getDb();
    const currentMonth = new Date().toISOString().slice(0, 7);

    const totals = db.prepare(`
      SELECT
        utility_type,
        COUNT(*) AS count,
        COALESCE(SUM(total_amount), 0) AS total_amount,
        COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN total_amount ELSE 0 END), 0) AS paid_amount,
        COALESCE(SUM(CASE WHEN payment_status IN ('pending', 'overdue') THEN total_amount ELSE 0 END), 0) AS due_amount
      FROM utility_bills
      WHERE tenant_id = ? AND bill_date LIKE ?
      GROUP BY utility_type
    `).all(tenantId, `${currentMonth}%`);

    const overdue = db.prepare(`
      SELECT COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS total
      FROM utility_bills
      WHERE tenant_id = ? AND payment_status IN ('pending', 'overdue') AND due_date < date('now')
    `).get(tenantId);

    return { byType: totals, overdue };
  }
}

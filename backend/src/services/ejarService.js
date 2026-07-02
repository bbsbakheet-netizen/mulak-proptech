import { getDb } from '../db/database.js';
import { generateId, now } from './helpers.js';
import https from 'https';

const EJAR_API_SANDBOX = 'https://api.sandbox.ejar.sa/v1';
const EJAR_API_PRODUCTION = 'https://api.ejar.sa/v1';

export function getEjarConfig(tenantId) {
  const db = getDb();
  const tenant = db.prepare(`
    SELECT t.*, z.environment, z.building_number, z.street, z.district, z.city, z.postal_code, z.additional_number
    FROM tenants t
    LEFT JOIN zatca_settings z ON z.tenant_id = t.id
    WHERE t.id = ?
  `).get(tenantId);
  return tenant;
}

export function validateContractForEjar(tenantId, contractId) {
  const db = getDb();
  const contract = db.prepare(`
    SELECT rc.*, r.full_name_ar AS renter_name, r.national_id AS renter_national_id,
      r.phone AS renter_phone, r.email AS renter_email, r.building_number AS renter_building,
      r.street AS renter_street, r.district AS renter_district, r.city AS renter_city,
      r.postal_code AS renter_postal, r.sub_number AS renter_sub_number,
      u.unit_number,
      p.name_ar AS property_name, p.city AS property_city,
      o.full_name_ar AS owner_name, o.national_id AS owner_national_id, o.phone AS owner_phone
    FROM rental_contracts rc
    JOIN units u ON u.id = rc.unit_id
    JOIN properties p ON p.id = u.property_id
    JOIN renters r ON r.id = rc.renter_id
    LEFT JOIN property_ownership po ON po.property_id = p.id
    LEFT JOIN owners o ON o.id = po.owner_id
    WHERE rc.id = ? AND rc.tenant_id = ?
  `).get(contractId, tenantId);
  if (!contract) throw new Error('العقد غير موجود');

  const errors = [];
  if (!contract.renter_national_id) errors.push('رقم هوية المستأجر مطلوب');
  if (!contract.renter_phone) errors.push('جوال المستأجر مطلوب');
  if (!contract.start_date) errors.push('تاريخ بداية العقد مطلوب');
  if (!contract.end_date) errors.push('تاريخ نهاية العقد مطلوب');
  if (!contract.annual_rent || contract.annual_rent <= 0) errors.push('الإيجار السنوي مطلوب');
  if (!contract.unit_number) errors.push('رقم الوحدة مطلوب');

  return { valid: errors.length === 0, errors, contract };
}

export function submitToEjar(tenantId, contractId) {
  const { valid, errors, contract } = validateContractForEjar(tenantId, contractId);
  if (!valid) throw new Error('العقد غير مكتمل: ' + errors.join('، '));

  const config = getEjarConfig(tenantId);
  const env = config?.environment || 'sandbox';
  const baseUrl = env === 'production' ? EJAR_API_PRODUCTION : EJAR_API_SANDBOX;

  const payload = {
    contractNumber: contract.contract_number,
    property: {
      buildingNumber: contract.property_building || config?.building_number || '',
      unitNumber: contract.unit_number,
      street: config?.street || '',
      district: config?.district || '',
      city: contract.property_city || config?.city || 'ينبع',
      postalCode: config?.postal_code || '',
      additionalNumber: config?.additional_number || '',
    },
    renter: {
      nationalId: contract.renter_national_id,
      fullName: contract.renter_name,
      phone: contract.renter_phone,
      email: contract.renter_email || '',
      buildingNumber: contract.renter_building || '',
      street: contract.renter_street || '',
      district: contract.renter_district || '',
      city: contract.renter_city || '',
      postalCode: contract.renter_postal || '',
      subNumber: contract.renter_sub_number || '',
    },
    contractDetails: {
      startDate: contract.start_date,
      endDate: contract.end_date,
      annualRent: contract.annual_rent,
      securityDeposit: contract.security_deposit || 0,
      paymentFrequency: contract.payment_frequency || 'monthly',
      numberOfInstallments: contract.installments_count || 12,
      purpose: ' residential',
    },
  };

  // Simulate Ejar submission for sandbox
  if (env === 'sandbox') {
    return simulateEjarSubmission(tenantId, contractId, contract, payload);
  }

  // Real API call would go here
  return callEjarApi(tenantId, contractId, payload, baseUrl);
}

function simulateEjarSubmission(tenantId, contractId, contract, payload) {
  const db = getDb();
  const nowStr = now();
  const ejarId = `EJ-${Date.now().toString(36).toUpperCase()}`;
  const status = Math.random() > 0.2 ? 'registered' : 'pending_review';

  db.prepare(`UPDATE rental_contracts SET ijar_contract_id=?, ijar_status=?, updated_at=? WHERE id=? AND tenant_id=?`)
    .run(ejarId, status, nowStr, contractId, tenantId);

  // Log
  addEjarLog(tenantId, contractId, 'submit', status, JSON.stringify(payload), null);

  return {
    success: true,
    ejar_contract_id: ejarId,
    status,
    message: status === 'registered' ? 'تم تسجيل العقد في إيجار بنجاح' : 'العقد قيد المراجعة من إيجار',
    environment: 'sandbox',
    payload,
  };
}

function callEjarApi(tenantId, contractId, payload, baseUrl) {
  // Placeholder for real Ejar API integration
  // In production, this would make an HTTPS request to Ejar's API
  const db = getDb();
  const ejarId = `EJ-${Date.now().toString(36).toUpperCase()}`;
  db.prepare(`UPDATE rental_contracts SET ijar_contract_id=?, ijar_status='submitted', updated_at=? WHERE id=? AND tenant_id=?`)
    .run(ejarId, now(), contractId, tenantId);
  addEjarLog(tenantId, contractId, 'submit', 'submitted', JSON.stringify(payload), null);
  return { success: true, ejar_contract_id: ejarId, status: 'submitted', message: 'تم إرسال العقد إلى إيجار', environment: 'production', payload };
}

export function checkEjarStatus(tenantId, contractId) {
  const db = getDb();
  const contract = db.prepare(`SELECT ijar_contract_id, ijar_status FROM rental_contracts WHERE id=? AND tenant_id=?`).get(contractId, tenantId);
  if (!contract) throw new Error('العقد غير موجود');
  if (!contract.ijar_contract_id) throw new Error('لم يتم إرسال العقد إلى إيجار بعد');

  // Simulate status check
  const statuses = ['registered', 'pending_review', 'verified', 'rejected'];
  const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
  const newStatus = contract.ijar_status === 'registered' ? 'registered' : randomStatus;

  db.prepare(`UPDATE rental_contracts SET ijar_status=?, updated_at=? WHERE id=?`).run(newStatus, now(), contractId);
  addEjarLog(tenantId, contractId, 'status_check', newStatus, null, null);

  return { contract_id: contractId, ijar_contract_id: contract.ijar_contract_id, status: newStatus };
}

export function listEjarContracts(tenantId, filters = {}) {
  const db = getDb();
  let query = `
    SELECT rc.id, rc.contract_number, rc.ijar_contract_id, rc.ijar_status,
      rc.start_date, rc.end_date, rc.annual_rent, rc.status AS local_status,
      r.full_name_ar AS renter_name, r.national_id AS renter_national_id,
      u.unit_number, p.name_ar AS property_name
    FROM rental_contracts rc
    JOIN renters r ON r.id = rc.renter_id
    JOIN units u ON u.id = rc.unit_id
    JOIN properties p ON p.id = u.property_id
    WHERE rc.tenant_id = ? AND rc.ijar_contract_id IS NOT NULL
  `;
  const params = [tenantId];
  if (filters.ijar_status) { query += ` AND rc.ijar_status = ?`; params.push(filters.ijar_status); }
  if (filters.status) { query += ` AND rc.status = ?`; params.push(filters.status); }
  query += ` ORDER BY rc.created_at DESC LIMIT 100`;
  return db.prepare(query).all(...params);
}

export function listPendingContracts(tenantId) {
  const db = getDb();
  return db.prepare(`
    SELECT rc.id, rc.contract_number, rc.start_date, rc.end_date, rc.annual_rent, rc.status,
      r.full_name_ar AS renter_name, r.national_id AS renter_national_id,
      u.unit_number, p.name_ar AS property_name
    FROM rental_contracts rc
    JOIN renters r ON r.id = rc.renter_id
    JOIN units u ON u.id = rc.unit_id
    JOIN properties p ON p.id = u.property_id
    WHERE rc.tenant_id = ? AND rc.ijar_contract_id IS NULL AND rc.status = 'active'
    ORDER BY rc.created_at DESC
  `).all(tenantId);
}

export function getEjarStats(tenantId) {
  const db = getDb();
  const stats = db.prepare(`
    SELECT ijar_status, COUNT(*) AS count FROM rental_contracts
    WHERE tenant_id = ? AND ijar_contract_id IS NOT NULL GROUP BY ijar_status
  `).all(tenantId);
  const total = stats.reduce((s, r) => s + r.count, 0);
  const registered = stats.find(r => r.ijar_status === 'registered')?.count || 0;
  const pending = stats.find(r => r.ijar_status === 'pending_review' || r.ijar_status === 'submitted')?.count || 0;
  const unsubmitted = db.prepare(`
    SELECT COUNT(*) AS c FROM rental_contracts WHERE tenant_id = ? AND ijar_contract_id IS NULL AND status = 'active'
  `).get(tenantId).c || 0;
  return { total, registered, pending, unsubmitted, byStatus: stats };
}

function addEjarLog(tenantId, contractId, action, status, request, response) {
  const db = getDb();
  const id = generateId();
  db.prepare(`
    INSERT INTO audit_log (tenant_id, user_id, action, table_name, record_id, new_data, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(tenantId, 'system', `ejar_${action}`, 'rental_contracts', contractId,
    JSON.stringify({ status, request, response }), now());
}

export function updateEjarCredentials(tenantId, data) {
  const db = getDb();
  const existing = db.prepare(`SELECT id FROM tenants WHERE id=?`).get(tenantId);
  if (!existing) throw new Error('المنشأة غير موجودة');
  const settings = JSON.parse(existing.settings || '{}');
  settings.ejar_api_key = data.api_key || settings.ejar_api_key;
  settings.ejar_api_secret = data.api_secret || settings.ejar_api_secret;
  settings.ejar_environment = data.environment || settings.ejar_environment || 'sandbox';
  db.prepare(`UPDATE tenants SET settings=? WHERE id=?`).run(JSON.stringify(settings), tenantId);
  return { success: true, message: 'تم تحديث بيانات اعتماد إيجار' };
}

export function getEjarCredentials(tenantId) {
  const db = getDb();
  const tenant = db.prepare(`SELECT settings FROM tenants WHERE id=?`).get(tenantId);
  if (!tenant) return null;
  const settings = JSON.parse(tenant.settings || '{}');
  return {
    api_key: settings.ejar_api_key ? '••••' + settings.ejar_api_key.slice(-4) : '',
    environment: settings.ejar_environment || 'sandbox',
    has_credentials: !!settings.ejar_api_key,
  };
}

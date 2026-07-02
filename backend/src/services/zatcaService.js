import { getDb } from '../db/database.js';
import { generateId } from './helpers.js';
import crypto from 'crypto';

// ── Settings ────────────────────────────────────────────────

export function getSettings(tenantId) {
  const db = getDb();
  let settings = db.prepare(`SELECT * FROM zatca_settings WHERE tenant_id = ?`).get(tenantId);
  if (!settings) {
    const id = generateId();
    const tenant = db.prepare(`SELECT vat_number, cr_number, name_ar, name_en, city FROM tenants WHERE id = ?`).get(tenantId);
    db.prepare(`
      INSERT INTO zatca_settings (id, tenant_id, organization_name, vat_number, cr_number, city)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, tenantId, tenant?.name_ar || '', tenant?.vat_number || '', tenant?.cr_number || '', tenant?.city || 'ينبع');
    settings = db.prepare(`SELECT * FROM zatca_settings WHERE id = ?`).get(id);
  }
  return settings;
}

export function updateSettings(tenantId, data) {
  const db = getDb();
  const existing = db.prepare(`SELECT id FROM zatca_settings WHERE tenant_id = ?`).get(tenantId);
  if (!existing) {
    const id = generateId();
    db.prepare(`
      INSERT INTO zatca_settings (id, tenant_id, organization_name, vat_number, cr_number,
        building_number, street, district, city, postal_code, additional_number, environment)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, tenantId, data.organization_name || '', data.vat_number || '', data.cr_number || '',
      data.building_number || '', data.street || '', data.district || '', data.city || '',
      data.postal_code || '', data.additional_number || '', data.environment || 'sandbox');
  } else {
    db.prepare(`
      UPDATE zatca_settings SET
        organization_name=COALESCE(?, organization_name), vat_number=COALESCE(?, vat_number),
        cr_number=COALESCE(?, cr_number), building_number=COALESCE(?, building_number),
        street=COALESCE(?, street), district=COALESCE(?, district),
        city=COALESCE(?, city), postal_code=COALESCE(?, postal_code),
        additional_number=COALESCE(?, additional_number), environment=COALESCE(?, environment),
        is_compliant=?, updated_at=datetime('now')
      WHERE tenant_id=?
    `).run(
      data.organization_name || null, data.vat_number || null, data.cr_number || null,
      data.building_number || null, data.street || null, data.district || null,
      data.city || null, data.postal_code || null, data.additional_number || null,
      data.environment || null, data.is_compliant !== undefined ? (data.is_compliant ? 1 : 0) : 0,
      tenantId);
  }
  return getSettings(tenantId);
}

// ── Invoice / Receipt ZATCA Operations ─────────────────────

export function generateInvoiceUuid() {
  return crypto.randomUUID();
}

export function generateInvoiceHash(invoiceData) {
  const canonical = JSON.stringify(invoiceData, Object.keys(invoiceData).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export function generateQrCode(sellerName, vatNumber, timestamp, total, vatTotal) {
  function encodeTlv(tag, value) {
    const buf = Buffer.from(value, 'utf-8');
    const len = buf.length;
    const tagBuf = Buffer.alloc(1); tagBuf.writeUInt8(tag);
    const lenBuf = len < 128 ? Buffer.alloc(1) : (len < 256 ? Buffer.from([0x81, len]) : Buffer.from([0x82, (len >> 8) & 0xff, len & 0xff]));
    if (len < 128) lenBuf.writeUInt8(len);
    return Buffer.concat([tagBuf, lenBuf, buf]);
  }
  const tlvBuf = Buffer.concat([
    encodeTlv(1, sellerName), encodeTlv(2, vatNumber),
    encodeTlv(3, timestamp), encodeTlv(4, total), encodeTlv(5, vatTotal),
  ]);
  return tlvBuf.toString('base64');
}

export function prepareReceiptForZatca(tenantId, receiptId) {
  const db = getDb();
  const receipt = db.prepare(`
    SELECT r.*, t.name_ar AS tenant_name, t.vat_number, z.organization_name,
      z.environment, z.building_number, z.street, z.district, z.city, z.postal_code,
      rt.full_name_ar AS renter_name, rt.vat_number AS renter_vat
    FROM receipts r
    LEFT JOIN tenants t ON t.id = r.tenant_id
    LEFT JOIN zatca_settings z ON z.tenant_id = r.tenant_id
    LEFT JOIN renters rt ON rt.id = r.renter_id
    WHERE r.id = ? AND r.tenant_id = ?
  `).get(receiptId, tenantId);
  if (!receipt) throw new Error('الفاتورة غير موجودة');

  const uuid = generateInvoiceUuid();
  const now = new Date();
  const timestamp = now.toISOString().replace('Z', '+03:00');
  const total = (receipt.total_amount || 0).toFixed(2);
  const vatTotal = (receipt.vat_amount || 0).toFixed(2);
  const sellerName = receipt.organization_name || receipt.tenant_name || 'مُلاك العقارية';
  const vatNumber = receipt.vat_number || '300000000000003';

  const qrCode = generateQrCode(sellerName, vatNumber, timestamp, total, vatTotal);
  const xmlContent = generateSimplifiedXml(receipt, uuid, sellerName, vatNumber, timestamp);
  const hashData = { uuid, sellerName, vatNumber, timestamp, total, vatTotal, xml: xmlContent };
  const invoiceHash = generateInvoiceHash(hashData);

  // Update receipt
  db.prepare(`UPDATE receipts SET zatca_uuid=?, zatca_invoice_hash=?, zatca_qr_code=?, zatca_status='prepared' WHERE id=? AND tenant_id=?`)
    .run(uuid, invoiceHash, qrCode, receiptId, tenantId);

  // Add to queue
  const queueId = generateId();
  db.prepare(`
    INSERT INTO zatca_invoice_queue (id, tenant_id, receipt_id, invoice_number, invoice_type,
      invoice_uuid, invoice_hash, qr_code, xml_content, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(queueId, tenantId, receiptId, receipt.receipt_number, 'simplified',
    uuid, invoiceHash, qrCode, xmlContent, 'pending');

  return { id: queueId, uuid, invoiceHash, qrCode, xmlContent, status: 'prepared' };
}

export function submitToZatca(tenantId, queueId) {
  const db = getDb();
  const item = db.prepare(`SELECT * FROM zatca_invoice_queue WHERE id=? AND tenant_id=?`).get(queueId, tenantId);
  if (!item) throw new Error('العنصر غير موجود في قائمة الانتظار');

  const settings = db.prepare(`SELECT * FROM zatca_settings WHERE tenant_id=?`).get(tenantId);
  const env = settings?.environment || 'sandbox';

  // Simulate submission — in production this would call ZATCA API
  const now = new Date().toISOString();
  const status = env === 'sandbox' ? 'reported' : 'submitted';
  const response = {
    zatca_status: status,
    zatca_response: JSON.stringify({
      status,
      message: env === 'sandbox' ? 'تم المحاكاة في بيئة الاختبار' : 'تم الإرسال للمصادقة',
      timestamp: now,
      invoice_uuid: item.invoice_uuid,
      invoice_hash: item.invoice_hash,
    }),
    zatca_status_code: status === 'reported' ? '1000' : '2000',
  };

  db.prepare(`
    UPDATE zatca_invoice_queue SET
      status=?, zatca_response=?, zatca_status_code=?, submitted_at=?,
      reported_at=CASE WHEN ?='reported' THEN ? ELSE NULL END,
      updated_at=datetime('now')
    WHERE id=? AND tenant_id=?
  `).run(response.zatca_status, response.zatca_response, response.zatca_status_code,
    now, status, now, queueId, tenantId);

  // Update receipt status
  if (item.receipt_id) {
    db.prepare(`UPDATE receipts SET zatca_status=?, zatca_submitted_at=? WHERE id=?`)
      .run(response.zatca_status, now, item.receipt_id);
  }

  return { ...item, ...response };
}

export function submitAllPending(tenantId) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM zatca_invoice_queue WHERE tenant_id = ? AND status = 'pending'`).all(tenantId);
  const results = pending.map(item => submitToZatca(tenantId, item.id));
  return { submitted: results.length, results };
}

export function submitReceipt(tenantId, receiptId) {
  const prepared = prepareReceiptForZatca(tenantId, receiptId);
  const result = submitToZatca(tenantId, prepared.id);
  return result;
}

// ── Queue & Status ─────────────────────────────────────────

export function listQueue(tenantId, filters = {}) {
  const db = getDb();
  let query = `SELECT q.*, r.receipt_number, r.total_amount, r.payment_date, r.renter_id,
    rt.full_name_ar AS renter_name
    FROM zatca_invoice_queue q
    LEFT JOIN receipts r ON r.id = q.receipt_id
    LEFT JOIN renters rt ON rt.id = r.renter_id
    WHERE q.tenant_id = ?`;
  const params = [tenantId];
  if (filters.status) { query += ` AND q.status = ?`; params.push(filters.status); }
  query += ` ORDER BY q.created_at DESC LIMIT 100`;
  return db.prepare(query).all(...params);
}

export function getQueueStats(tenantId) {
  const db = getDb();
  const stats = db.prepare(`
    SELECT status, COUNT(*) AS count FROM zatca_invoice_queue WHERE tenant_id = ? GROUP BY status
  `).all(tenantId);
  const total = stats.reduce((s, r) => s + r.count, 0);
  const pending = stats.find(r => r.status === 'pending')?.count || 0;
  const failed = stats.find(r => r.status === 'failed' || r.status === 'rejected')?.count || 0;
  const cleared = stats.find(r => r.status === 'cleared' || r.status === 'reported')?.count || 0;
  return { total, pending, failed, cleared, byStatus: stats };
}

// ── XML Generation (Simplified UBL 2.1) ────────────────────

function generateSimplifiedXml(receipt, uuid, sellerName, vatNumber, timestamp) {
  const total = (receipt.total_amount || 0).toFixed(2);
  const vatTotal = (receipt.vat_amount || 0).toFixed(2);
  const subtotal = (receipt.amount || 0).toFixed(2);
  const date = timestamp.split('T')[0];
  const renterName = receipt.renter_name || 'عميل نقدي';
  const renterVat = receipt.renter_vat || '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ID>${receipt.receipt_number}</cbc:ID>
  <cbc:UUID>${uuid}</cbc:UUID>
  <cbc:IssueDate>${date}</cbc:IssueDate>
  <cbc:IssueTime>${timestamp.split('T')[1]?.split('+')[0] || '00:00:00'}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="0100000">388</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification><cbc:ID schemeID="CRN">${receipt.cr_number || ''}</cbc:ID></cac:PartyIdentification>
      <cac:PartyName><cbc:Name>${sellerName}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${receipt.street || ''}</cbc:StreetName>
        <cbc:BuildingNumber>${receipt.building_number || ''}</cbc:BuildingNumber>
        <cbc:CitySubdivisionName>${receipt.district || ''}</cbc:CitySubdivisionName>
        <cbc:CityName>${receipt.city || 'ينبع'}</cbc:CityName>
        <cbc:PostalZone>${receipt.postal_code || ''}</cbc:PostalZone>
        <cbc:CountrySubentity>${receipt.city || ''}</cbc:CountrySubentity>
        <cac:Country><cbc:IdentificationCode>SA</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${vatNumber}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification><cbc:ID>${renterName}</cbc:ID></cac:PartyIdentification>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${renterVat}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="SAR">${vatTotal}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="SAR">${subtotal}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="SAR">${vatTotal}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>15.00</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="SAR">${subtotal}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="SAR">${subtotal}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="SAR">${total}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="SAR">${total}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="DAY">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="SAR">${subtotal}</cbc:LineExtensionAmount>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="SAR">${vatTotal}</cbc:TaxAmount>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Name>${receipt.description_ar || 'دفعة إيجار'}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>15.00</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="SAR">${subtotal}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;
}

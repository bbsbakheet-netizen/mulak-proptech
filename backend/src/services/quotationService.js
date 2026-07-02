import { getDb } from '../db/database.js';
import { generateId, generateQuoteNumber, now } from './helpers.js';

export class QuotationService {
  create(tenant, data) {
    const db = getDb();
    const id = generateId();
    const quoteNumber = generateQuoteNumber(tenant.tenantId, db);

    let subtotal = 0;
    const items = (data.items || []).map(item => {
      const lineTotal = (item.qty || 1) * (item.unit_price || 0);
      subtotal += lineTotal;
      return { ...item, line_total: lineTotal };
    });

    const vatAmount = items.reduce((s, i) => s + (i.line_total * 0.15), 0);
    const discountAmount = subtotal * ((data.discount_pct || 0) / 100);

    db.prepare(`
      INSERT INTO quotations (id, tenant_id, quote_number, quote_type,
        client_name_ar, client_name_en, client_phone, client_email, client_cr,
        property_id, unit_id, items, subtotal, vat_amount, total_amount,
        discount_pct, discount_amount, valid_until, notes_ar, notes_en,
        terms_ar, terms_en, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, tenant.tenantId, quoteNumber, data.quote_type || 'rental',
      data.client_name_ar, data.client_name_en || null,
      data.client_phone || null, data.client_email || null, data.client_cr || null,
      data.property_id || null, data.unit_id || null,
      JSON.stringify(items), subtotal, vatAmount,
      subtotal - discountAmount + vatAmount,
      data.discount_pct || 0, discountAmount,
      data.valid_until || null, data.notes_ar || null, data.notes_en || null,
      data.terms_ar || null, data.terms_en || null, tenant.userId
    );

    return db.prepare('SELECT * FROM quotations WHERE id = ?').get(id);
  }

  findAll(tenantId) {
    const db = getDb();
    return db.prepare(
      'SELECT * FROM quotations WHERE tenant_id = ? ORDER BY created_at DESC'
    ).all(tenantId);
  }

  acceptConvert(tenant, quoteId) {
    const db = getDb();
    const quote = db.prepare('SELECT * FROM quotations WHERE id = ? AND tenant_id = ?')
      .get(quoteId, tenant.tenantId);

    if (!quote) throw { status: 404, message: 'Quotation not found' };

    db.prepare('UPDATE quotations SET status = ?, accepted_at = ? WHERE id = ?')
      .run('accepted', now(), quoteId);

    return db.prepare('SELECT * FROM quotations WHERE id = ?').get(quoteId);
  }
}

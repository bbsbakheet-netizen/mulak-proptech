import { Router } from 'express';
import { getDb } from '../db/database.js';
import crypto from 'crypto';

const router = Router();

function generateId() {
  return crypto.randomBytes(12).toString('hex');
}

// Get all customers (individuals + companies)
router.get('/', (req, res) => {
  const db = getDb();
  const { type, status } = req.query;
  let sql = `SELECT * FROM renters WHERE tenant_id = ?`;
  const params = [req.tenant.tenantId];
  if (type) { sql += ` AND customer_type = ?`; params.push(type); }
  if (status) { sql += ` AND customer_status = ?`; params.push(status); }
  sql += ` ORDER BY created_at DESC`;
  const customers = db.prepare(sql).all(...params);
  res.json(customers);
});

// Get single customer
router.get('/:id', (req, res) => {
  const db = getDb();
  const customer = db.prepare('SELECT * FROM renters WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenant.tenantId);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  res.json(customer);
});

// Create customer
router.post('/', (req, res) => {
  const db = getDb();
  const { customer_type, full_name_ar, phone, email, national_id, company_name_ar, cr_number, vat_number, national_address, building_number, street, district, city, postal_code, sub_number, notes } = req.body;
  if (!customer_type || !['individual', 'company'].includes(customer_type)) {
    return res.status(400).json({ error: 'Valid customer_type required (individual/company)' });
  }
  if (customer_type === 'individual' && !full_name_ar) {
    return res.status(400).json({ error: 'Individual name is required' });
  }
  if (customer_type === 'company' && !company_name_ar) {
    return res.status(400).json({ error: 'Company name is required' });
  }
  const id = generateId();
  db.prepare(`
    INSERT INTO renters (id, tenant_id, customer_type, full_name_ar, national_id, phone, email,
      company_name_ar, cr_number, vat_number, national_address, building_number, street, district, city, postal_code, sub_number, notes, customer_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
  `).run(id, req.tenant.tenantId, customer_type, full_name_ar || company_name_ar || 'عميل',
    national_id || cr_number || `CUST-${Date.now()}`,
    phone || null, email || null, company_name_ar || null, cr_number || null,
    vat_number || null, national_address || null, building_number || null, street || null, district || null, city || null, postal_code || null, sub_number || null, notes || null);
  const customer = db.prepare('SELECT * FROM renters WHERE id = ?').get(id);
  res.status(201).json(customer);
});

// Update customer
router.put('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM renters WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenant.tenantId);
  if (!existing) return res.status(404).json({ error: 'Customer not found' });
  const { full_name_ar, phone, email, national_id, company_name_ar, cr_number, vat_number, national_address, building_number, street, district, city, postal_code, sub_number, notes, customer_status } = req.body;
  db.prepare(`
    UPDATE renters SET full_name_ar = COALESCE(?, full_name_ar), phone = COALESCE(?, phone),
      email = COALESCE(?, email), national_id = COALESCE(?, national_id),
      company_name_ar = COALESCE(?, company_name_ar), cr_number = COALESCE(?, cr_number),
      vat_number = COALESCE(?, vat_number), national_address = COALESCE(?, national_address),
      building_number = COALESCE(?, building_number), street = COALESCE(?, street),
      district = COALESCE(?, district), city = COALESCE(?, city),
      postal_code = COALESCE(?, postal_code), sub_number = COALESCE(?, sub_number),
      notes = COALESCE(?, notes), customer_status = COALESCE(?, customer_status)
    WHERE id = ? AND tenant_id = ?
  `).run(full_name_ar, phone, email, national_id, company_name_ar, cr_number, vat_number, national_address, building_number, street, district, city, postal_code, sub_number, notes, customer_status, req.params.id, req.tenant.tenantId);
  const customer = db.prepare('SELECT * FROM renters WHERE id = ?').get(req.params.id);
  res.json(customer);
});

// Delete customer
router.delete('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM renters WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenant.tenantId);
  if (!existing) return res.status(404).json({ error: 'Customer not found' });
  db.prepare('DELETE FROM renters WHERE id = ? AND tenant_id = ?').run(req.params.id, req.tenant.tenantId);
  res.json({ success: true });
});

export default router;

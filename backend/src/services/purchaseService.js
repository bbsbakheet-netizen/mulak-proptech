import { getDb } from '../db/database.js';
import { generateId, now } from './helpers.js';

export class PurchaseService {
  // ─── Vendors ────────────────────────────────
  createVendor(tenant, data) {
    const db = getDb();
    const id = generateId();
    const seq = db.prepare(
      "SELECT COUNT(*) AS c FROM vendors WHERE tenant_id = ?"
    ).get(tenant.tenantId).c + 1;
    const vendorCode = `V-${String(seq).padStart(4, '0')}`;

    db.prepare(`
      INSERT INTO vendors (id, tenant_id, vendor_code, name_ar, name_en, cr_number,
        vat_number, contact_person, phone, email, website, address, category,
        payment_terms, bank_name, iban, is_active, notes,
        building_number, street, district, city, postal_code, sub_number)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?)
    `).run(
      id, tenant.tenantId, vendorCode, data.name_ar, data.name_en || null,
      data.cr_number || null, data.vat_number || null, data.contact_person || null,
      data.phone || null, data.email || null, data.website || null,
      data.address || null, data.category || 'general', data.payment_terms || 'net_30',
      data.bank_name || null, data.iban || null, data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1,
      data.notes || null,
      data.building_number || null, data.street || null, data.district || null, data.city || null, data.postal_code || null, data.sub_number || null
    );

    return db.prepare('SELECT * FROM vendors WHERE id = ?').get(id);
  }

  findAllVendors(tenantId, query = {}) {
    const db = getDb();
    let sql = 'SELECT * FROM vendors WHERE tenant_id = ?';
    const params = [tenantId];

    if (query.category) {
      sql += ' AND category = ?';
      params.push(query.category);
    }
    if (query.is_active !== undefined) {
      sql += ' AND is_active = ?';
      params.push(query.is_active ? 1 : 0);
    }

    sql += ' ORDER BY name_ar ASC';
    return db.prepare(sql).all(...params);
  }

  findVendorById(tenantId, id) {
    const db = getDb();
    return db.prepare('SELECT * FROM vendors WHERE id = ? AND tenant_id = ?').get(id, tenantId) || null;
  }

  // ─── Purchase Orders ────────────────────────
  createPO(tenant, data) {
    const db = getDb();
    const id = generateId();
    const year = new Date().getFullYear();
    const seq = db.prepare(
      "SELECT COUNT(*) AS c FROM purchase_orders WHERE tenant_id = ? AND order_date LIKE ?"
    ).get(tenant.tenantId, `${year}%`).c + 1;
    const poNumber = `PO-${year}-${String(seq).padStart(5, '0')}`;

    // Auto-create vendor if supplier_name given without vendor_id
    let vendorId = data.vendor_id;
    if (!vendorId && data.supplier_name) {
      const existing = db.prepare('SELECT id FROM vendors WHERE tenant_id = ? AND name_ar = ?').get(tenant.tenantId, data.supplier_name);
      if (existing) {
        vendorId = existing.id;
      } else {
        const vid = generateId();
        const vseq = db.prepare("SELECT COUNT(*) AS c FROM vendors WHERE tenant_id = ?").get(tenant.tenantId).c + 1;
        const vcode = `V-${String(vseq).padStart(4, '0')}`;
        db.prepare(`INSERT INTO vendors (id, tenant_id, vendor_code, name_ar, name_en, vat_number, phone, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`)
          .run(vid, tenant.tenantId, vcode, data.supplier_name, data.supplier_name, data.supplier_tax_number || null, null);
        vendorId = vid;
      }
    }

    // Calculate totals from items
    const items = (data.items || []).map(item => ({
      ...item,
      total: (item.qty || 0) * (item.unit_price || 0),
    }));
    const subtotal = items.reduce((s, i) => s + i.total, 0);
    const discountAmount = subtotal * ((data.discount_pct || 0) / 100);
    const vatAmount = Math.round((subtotal - discountAmount) * 0.15);
    const totalAmount = subtotal - discountAmount + vatAmount + (data.shipping_cost || 0);

    db.prepare(`
      INSERT INTO purchase_orders (id, tenant_id, po_number, vendor_id, property_id,
        order_date, expected_date, status, items, subtotal, discount_amount,
        vat_amount, shipping_cost, total_amount, notes, terms, created_by,
        supplier_tax_number, supplier_invoice_no, supplier_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, tenant.tenantId, poNumber, vendorId, data.property_id || null,
      data.order_date || new Date().toISOString().split('T')[0],
      data.expected_date || null, data.status || 'draft',
      JSON.stringify(items), subtotal, discountAmount,
      vatAmount, data.shipping_cost || 0, totalAmount,
      data.notes || null, data.terms || null, tenant.userId,
      data.supplier_tax_number || null,
      data.supplier_invoice_no || null,
      data.supplier_name || null
    );

    return db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id);
  }

  findAllPOs(tenantId, query = {}) {
    const db = getDb();
    let sql = `
      SELECT po.*, v.name_ar AS vendor_name_ar, p.name_ar AS property_name_ar
      FROM purchase_orders po
      LEFT JOIN vendors v ON v.id = po.vendor_id
      LEFT JOIN properties p ON p.id = po.property_id
      WHERE po.tenant_id = ?
    `;
    const params = [tenantId];

    if (query.status) {
      sql += ' AND po.status = ?';
      params.push(query.status);
    }
    if (query.vendor_id) {
      sql += ' AND po.vendor_id = ?';
      params.push(query.vendor_id);
    }

    sql += ' ORDER BY po.created_at DESC';
    return db.prepare(sql).all(...params);
  }

  findPOById(tenantId, id) {
    const db = getDb();
    return db.prepare(`
      SELECT po.*, v.name_ar AS vendor_name_ar, v.phone AS vendor_phone,
        v.contact_person, p.name_ar AS property_name_ar
      FROM purchase_orders po
      LEFT JOIN vendors v ON v.id = po.vendor_id
      LEFT JOIN properties p ON p.id = po.property_id
      WHERE po.id = ? AND po.tenant_id = ?
    `).get(id, tenantId) || null;
  }

  updatePOStatus(tenantId, id, status) {
    const db = getDb();
    const existing = this.findPOById(tenantId, id);
    if (!existing) return null;

    db.prepare('UPDATE purchase_orders SET status = ?, updated_at = ? WHERE id = ? AND tenant_id = ?')
      .run(status, now(), id, tenantId);

    return this.findPOById(tenantId, id);
  }

  receivePO(tenantId, id, receivedItems) {
    const db = getDb();
    const po = this.findPOById(tenantId, id);
    if (!po) return null;

    const items = JSON.parse(po.items || '[]');

    if (receivedItems) {
      // Update quantities received
      for (const ri of receivedItems) {
        const item = items.find(i => i.name === ri.name);
        if (item) {
          item.received_qty = (item.received_qty || 0) + (ri.qty || 0);
        }
      }
    }

    const allReceived = items.every(i => (i.received_qty || 0) >= (i.qty || 0));
    const newStatus = allReceived ? 'received' : 'partially_received';
    const deliveryDate = allReceived ? new Date().toISOString().split('T')[0] : null;

    db.prepare(`
      UPDATE purchase_orders SET status = ?, items = ?, delivery_date = ?,
        updated_at = ? WHERE id = ? AND tenant_id = ?
    `).run(newStatus, JSON.stringify(items), deliveryDate, now(), id, tenantId);

    return this.findPOById(tenantId, id);
  }

  // ─── Inventory ──────────────────────────────
  createInventoryItem(tenant, data) {
    const db = getDb();
    const id = generateId();
    const seq = db.prepare(
      "SELECT COUNT(*) AS c FROM inventory_items WHERE tenant_id = ?"
    ).get(tenant.tenantId).c + 1;
    const itemCode = `INV-${String(seq).padStart(5, '0')}`;

    db.prepare(`
      INSERT INTO inventory_items (id, tenant_id, item_code, name_ar, name_en, category,
        description, unit_type, unit_cost, current_stock, min_stock, max_stock,
        location, property_id, vendor_id, is_active, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, tenant.tenantId, itemCode, data.name_ar, data.name_en || null,
      data.category || 'general', data.description || null,
      data.unit_type || 'piece', data.unit_cost || 0,
      data.current_stock || 0, data.min_stock || 0, data.max_stock || 0,
      data.location || null, data.property_id || null, data.vendor_id || null,
      data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1,
      data.notes || null
    );

    return db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id);
  }

  findAllInventory(tenantId, query = {}) {
    const db = getDb();
    let sql = `
      SELECT ii.*, v.name_ar AS vendor_name_ar, p.name_ar AS property_name_ar
      FROM inventory_items ii
      LEFT JOIN vendors v ON v.id = ii.vendor_id
      LEFT JOIN properties p ON p.id = ii.property_id
      WHERE ii.tenant_id = ?
    `;
    const params = [tenantId];

    if (query.category) {
      sql += ' AND ii.category = ?';
      params.push(query.category);
    }
    if (query.low_stock) {
      sql += ' AND ii.current_stock <= ii.min_stock';
    }

    sql += ' ORDER BY ii.name_ar ASC';
    return db.prepare(sql).all(...params);
  }

  adjustStock(tenantId, itemId, quantity, type, notes) {
    const db = getDb();
    const item = db.prepare('SELECT * FROM inventory_items WHERE id = ? AND tenant_id = ?')
      .get(itemId, tenantId);
    if (!item) return null;

    const newStock = type === 'in'
      ? item.current_stock + quantity
      : item.current_stock - quantity;

    db.prepare('UPDATE inventory_items SET current_stock = ?, updated_at = ? WHERE id = ?')
      .run(Math.max(0, newStock), now(), itemId);

    db.prepare(`
      INSERT INTO stock_movements (tenant_id, item_id, movement_type, quantity, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(tenantId, itemId, type, quantity, notes || null, 'system');

    return db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(itemId);
  }

  getLowStockItems(tenantId) {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM inventory_items
      WHERE tenant_id = ? AND current_stock <= min_stock AND is_active = 1
      ORDER BY (current_stock - min_stock) ASC
    `).all(tenantId);
  }
}

import { Router } from 'express';
import { getDb } from '../db/database.js';
import * as ownerService from '../services/ownerService.js';

const router = Router();

function tenantId(req) {
  return req.tenant?.id || 'default';
}

router.get('/', (req, res) => {
  try {
    const owners = ownerService.listOwners(tenantId(req));
    res.json({ success: true, data: owners });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const owner = ownerService.getOwner(tenantId(req), req.params.id);
    if (!owner) return res.status(404).json({ success: false, message: 'المالك غير موجود' });
    res.json({ success: true, data: owner });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const owner = ownerService.createOwner(tenantId(req), req.body);
    res.status(201).json({ success: true, data: owner });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const owner = ownerService.updateOwner(tenantId(req), req.params.id, req.body);
    if (!owner) return res.status(404).json({ success: false, message: 'المالك غير موجود' });
    res.json({ success: true, data: owner });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    ownerService.deleteOwner(tenantId(req), req.params.id);
    res.json({ success: true, message: 'تم حذف المالك' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:id/link', (req, res) => {
  try {
    const result = ownerService.linkProperty(tenantId(req), { ...req.body, owner_id: req.params.id });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:ownerId/unlink/:propertyId', (req, res) => {
  try {
    ownerService.unlinkProperty(tenantId(req), req.params.propertyId, req.params.ownerId);
    res.json({ success: true, message: 'تم فك الربط' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id/settlements', (req, res) => {
  try {
    const settlements = ownerService.listSettlements(tenantId(req), req.params.id);
    res.json({ success: true, data: settlements });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:id/settlements', (req, res) => {
  try {
    const settlement = ownerService.createSettlement(tenantId(req), { ...req.body, owner_id: req.params.id });
    res.status(201).json({ success: true, data: settlement });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id/report', (req, res) => {
  try {
    const owner = ownerService.getOwner(tenantId(req), req.params.id);
    if (!owner) return res.status(404).json({ success: false, message: 'المالك غير موجود' });
    const db = getDb();
    const receipts = db.prepare(`
      SELECT r.*, rc.contract_number, u.unit_number, p.name_ar AS property_name
      FROM receipts r
      JOIN rental_contracts rc ON rc.id = r.contract_id
      JOIN units u ON u.id = r.unit_id
      JOIN properties p ON p.id = u.property_id
      JOIN property_ownership po ON po.property_id = p.id
      WHERE po.owner_id = ? AND po.tenant_id = ?
      ORDER BY r.payment_date DESC LIMIT 100
    `).all(req.params.id, tenantId(req));
    const totalIncome = receipts.reduce((s, r) => s + r.total_amount, 0);
    res.json({ success: true, data: { owner: { ...owner, properties: undefined, settlements: undefined }, receipts, summary: { total_income: totalIncome, receipt_count: receipts.length } } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

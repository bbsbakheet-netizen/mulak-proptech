import { Router } from 'express';
import { PurchaseService } from '../services/purchaseService.js';

const router = Router();
const service = new PurchaseService();

// ─── Vendors ────────────────────────────────
router.post('/vendors', (req, res) => {
  const vendor = service.createVendor(req.tenant, req.body);
  res.status(201).json(vendor);
});

router.get('/vendors', (req, res) => {
  res.json(service.findAllVendors(req.tenant.tenantId, req.query));
});

router.get('/vendors/:id', (req, res) => {
  const vendor = service.findVendorById(req.tenant.tenantId, req.params.id);
  if (!vendor) return res.status(404).json({ error: true, message: 'Vendor not found' });
  res.json(vendor);
});

// ─── Purchase Orders ────────────────────────
router.post('/orders', (req, res) => {
  const po = service.createPO(req.tenant, req.body);
  res.status(201).json(po);
});

router.get('/orders', (req, res) => {
  res.json(service.findAllPOs(req.tenant.tenantId, req.query));
});

router.get('/orders/:id', (req, res) => {
  const po = service.findPOById(req.tenant.tenantId, req.params.id);
  if (!po) return res.status(404).json({ error: true, message: 'PO not found' });
  res.json(po);
});

router.put('/orders/:id/status', (req, res) => {
  const po = service.updatePOStatus(req.tenant.tenantId, req.params.id, req.body.status);
  if (!po) return res.status(404).json({ error: true, message: 'PO not found' });
  res.json(po);
});

router.post('/orders/:id/receive', (req, res) => {
  const po = service.receivePO(req.tenant.tenantId, req.params.id, req.body.items);
  if (!po) return res.status(404).json({ error: true, message: 'PO not found' });
  res.json(po);
});

// ─── Inventory ──────────────────────────────
router.post('/inventory', (req, res) => {
  const item = service.createInventoryItem(req.tenant, req.body);
  res.status(201).json(item);
});

router.get('/inventory', (req, res) => {
  res.json(service.findAllInventory(req.tenant.tenantId, req.query));
});

router.post('/inventory/:id/adjust', (req, res) => {
  const item = service.adjustStock(req.tenant.tenantId, req.params.id,
    req.body.quantity, req.body.type, req.body.notes);
  if (!item) return res.status(404).json({ error: true, message: 'Item not found' });
  res.json(item);
});

router.get('/inventory/low-stock', (req, res) => {
  res.json(service.getLowStockItems(req.tenant.tenantId));
});

export default router;

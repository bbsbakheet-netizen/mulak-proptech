import { Router } from 'express';
import { ReceiptService } from '../services/receiptService.js';
import { getDb } from '../db/database.js';

const router = Router();
const receiptService = new ReceiptService();

router.post('/', (req, res) => {
  const receipt = receiptService.create(req.tenant, req.body);
  res.status(201).json(receipt);
});

router.post('/from-schedule/:scheduleId', (req, res) => {
  try {
    const receipt = receiptService.createFromSchedule(req.tenant, req.params.scheduleId);
    res.status(201).json(receipt);
  } catch (e) {
    const status = e.status || 500;
    res.status(status).json({ error: true, message: e.message || 'Failed to create receipt from schedule' });
  }
});

router.post('/generate-due', (req, res) => {
  try {
    const result = receiptService.generateDueReceipts(req.tenant);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: true, message: e.message || 'Failed to generate due receipts' });
  }
});

router.get('/', (req, res) => {
  const receipts = receiptService.findAll(req.tenant.tenantId, req.query);
  res.json(receipts);
});

router.get('/pending', (req, res) => {
  const receipts = receiptService.getPending(req.tenant.tenantId);
  res.json(receipts);
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const receipt = db.prepare('SELECT * FROM receipts WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenant.tenantId);
  if (!receipt) return res.status(404).json({ error: true, message: 'Not found' });
  res.json(receipt);
});

router.post('/:id/approve', (req, res) => {
  try {
    const receipt = receiptService.approve(req.tenant.tenantId, req.params.id, req.tenant.userId);
    res.json(receipt);
  } catch (e) {
    const status = e.status || 500;
    res.status(status).json({ error: true, message: e.message || 'Approval failed' });
  }
});

router.put('/:id/zatca-report', (req, res) => {
  const receipt = receiptService.markZatcaReported(req.tenant.tenantId, req.params.id);
  if (!receipt) return res.status(404).json({ error: true, message: 'Receipt not found' });
  res.json(receipt);
});

router.post('/:id/zatca-qr', (req, res) => {
  const qr = receiptService.generateZatcaQr(req.tenant.tenantId, req.params.id);
  if (!qr) return res.status(404).json({ error: true, message: 'Receipt not found' });
  res.json(qr);
});

router.post('/:id/najiz-register', (req, res) => {
  const receipt = receiptService.registerNajiz(req.tenant.tenantId, req.params.id, req.body.najiz_ref);
  if (!receipt) return res.status(404).json({ error: true, message: 'Receipt not found' });
  res.json(receipt);
});

export default router;
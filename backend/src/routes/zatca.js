import { Router } from 'express';
import * as zatcaService from '../services/zatcaService.js';

const router = Router();
function tid(req) { return req.tenant?.id || 'default'; }
function uid(req) { return req.user?.id || 'system'; }

// ── Settings ─────────────────────────────────────────────────
router.get('/settings', (req, res) => {
  try {
    const settings = zatcaService.getSettings(tid(req));
    res.json({ success: true, data: settings });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.put('/settings', (req, res) => {
  try {
    const settings = zatcaService.updateSettings(tid(req), req.body);
    res.json({ success: true, data: settings });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

// ── Receipt ZATCA Operations ─────────────────────────────────
router.post('/prepare/:receiptId', (req, res) => {
  try {
    const result = zatcaService.prepareReceiptForZatca(tid(req), req.params.receiptId);
    res.json({ success: true, data: result });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

router.post('/submit/:receiptId', (req, res) => {
  try {
    const result = zatcaService.submitReceipt(tid(req), req.params.receiptId);
    res.json({ success: true, data: result });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

// ── Queue Management ────────────────────────────────────────
router.get('/queue', (req, res) => {
  try {
    const queue = zatcaService.listQueue(tid(req), req.query);
    res.json({ success: true, data: queue });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/queue/stats', (req, res) => {
  try {
    const stats = zatcaService.getQueueStats(tid(req));
    res.json({ success: true, data: stats });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/queue/submit-all', (req, res) => {
  try {
    const result = zatcaService.submitAllPending(tid(req));
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/queue/:id/submit', (req, res) => {
  try {
    const result = zatcaService.submitToZatca(tid(req), req.params.id);
    res.json({ success: true, data: result });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

// ── Generate QR for receipt ─────────────────────────────────
router.post('/qr/:receiptId', (req, res) => {
  try {
    const result = zatcaService.prepareReceiptForZatca(tid(req), req.params.receiptId);
    res.json({ success: true, data: { qr_code: result.qrCode, uuid: result.uuid } });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

export default router;

import { Router } from 'express';
import * as dealService from '../services/dealService.js';

const router = Router();
function tid(req) { return req.tenant?.id || 'default'; }
function uid(req) { return req.user?.id || 'system'; }

router.get('/', (req, res) => {
  try {
    const deals = dealService.listDeals(tid(req), req.query);
    res.json({ success: true, data: deals });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/analytics', (req, res) => {
  try {
    const analytics = dealService.dealAnalytics(tid(req));
    res.json({ success: true, data: analytics });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/:id', (req, res) => {
  try {
    const deal = dealService.getDeal(tid(req), req.params.id);
    if (!deal) return res.status(404).json({ success: false, message: 'الصفقة غير موجودة' });
    res.json({ success: true, data: deal });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/', (req, res) => {
  try {
    const deal = dealService.createDeal(tid(req), { ...req.body, created_by: uid(req) });
    res.status(201).json({ success: true, data: deal });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.put('/:id', (req, res) => {
  try {
    const deal = dealService.updateDeal(tid(req), req.params.id, req.body);
    res.json({ success: true, data: deal });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

router.patch('/:id/stage', (req, res) => {
  try {
    const deal = dealService.updateStage(tid(req), req.params.id, req.body.stage, req.body.reason);
    res.json({ success: true, data: deal });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

router.delete('/:id', (req, res) => {
  try {
    dealService.deleteDeal(tid(req), req.params.id);
    res.json({ success: true, message: 'تم حذف الصفقة' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/:id/activities', (req, res) => {
  try {
    const activity = dealService.addActivity(tid(req), req.params.id, { ...req.body, created_by: uid(req) });
    res.status(201).json({ success: true, data: activity });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Commissions ───────────────────────────────────────────────
router.get('/commissions/all', (req, res) => {
  try {
    const commissions = dealService.listCommissions(tid(req), req.query);
    res.json({ success: true, data: commissions });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/commissions', (req, res) => {
  try {
    const commission = dealService.createCommission(tid(req), { ...req.body, created_by: uid(req) });
    res.status(201).json({ success: true, data: commission });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

router.patch('/commissions/:id/status', (req, res) => {
  try {
    const commission = dealService.updateCommissionStatus(tid(req), req.params.id, req.body.status, uid(req));
    res.json({ success: true, data: commission });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

export default router;

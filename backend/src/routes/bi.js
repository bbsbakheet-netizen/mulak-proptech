import { Router } from 'express';
import * as biService from '../services/biService.js';

const router = Router();
function tid(req) { return req.tenant?.id || 'default'; }

router.get('/dashboard', (req, res) => {
  try {
    const summary = biService.getDashboardSummary(tid(req));
    res.json({ success: true, data: summary });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/occupancy', (req, res) => {
  try {
    const data = biService.getOccupancyRates(tid(req), req.query.branch_id);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/revenue', (req, res) => {
  try {
    const data = biService.getRevenueAnalytics(tid(req), req.query.year);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/roi', (req, res) => {
  try {
    const data = biService.getROI(tid(req));
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

export default router;

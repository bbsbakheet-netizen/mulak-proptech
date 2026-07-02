import { Router } from 'express';
import * as alertService from '../services/alertService.js';

const router = Router();
function tid(req) { return req.tenant?.id || 'default'; }

router.get('/', (req, res) => {
  try {
    const alerts = alertService.checkAlerts(tid(req));
    res.json({ success: true, data: alerts });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/stats', (req, res) => {
  try {
    const stats = alertService.getAlertStats(tid(req));
    res.json({ success: true, data: stats });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/dashboard', (req, res) => {
  try {
    const alerts = alertService.getDashboardAlerts(tid(req));
    res.json({ success: true, data: alerts });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

export default router;

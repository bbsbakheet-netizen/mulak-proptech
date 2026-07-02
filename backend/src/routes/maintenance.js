import { Router } from 'express';
import * as maintenanceService from '../services/maintenanceService.js';

const router = Router();
function tid(req) { return req.tenant?.id || 'default'; }
function uid(req) { return req.user?.id || 'system'; }

router.get('/', (req, res) => {
  try {
    const tickets = maintenanceService.listTickets(tid(req), req.query);
    res.json({ success: true, data: tickets });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/analytics', (req, res) => {
  try {
    const analytics = maintenanceService.ticketAnalytics(tid(req));
    res.json({ success: true, data: analytics });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/:id', (req, res) => {
  try {
    const ticket = maintenanceService.getTicket(tid(req), req.params.id);
    if (!ticket) return res.status(404).json({ success: false, message: 'التذكرة غير موجودة' });
    res.json({ success: true, data: ticket });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/', (req, res) => {
  try {
    const ticket = maintenanceService.createTicket(tid(req), { ...req.body, created_by: uid(req) });
    res.status(201).json({ success: true, data: ticket });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.put('/:id', (req, res) => {
  try {
    const ticket = maintenanceService.updateTicket(tid(req), req.params.id, req.body);
    res.json({ success: true, data: ticket });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

router.patch('/:id/status', (req, res) => {
  try {
    const ticket = maintenanceService.updateTicketStatus(tid(req), req.params.id, req.body.status, uid(req));
    res.json({ success: true, data: ticket });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

router.delete('/:id', (req, res) => {
  try {
    maintenanceService.deleteTicket(tid(req), req.params.id);
    res.json({ success: true, message: 'تم حذف التذكرة' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/:id/activities', (req, res) => {
  try {
    const activity = maintenanceService.addActivity(tid(req), req.params.id, { ...req.body, created_by: uid(req) });
    res.status(201).json({ success: true, data: activity });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Categories ────────────────────────────────────────────────
router.get('/categories/all', (req, res) => {
  try {
    const categories = maintenanceService.listCategories(tid(req));
    if (categories.length === 0) {
      maintenanceService.seedCategories(tid(req));
      return res.json({ success: true, data: maintenanceService.listCategories(tid(req)) });
    }
    res.json({ success: true, data: categories });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/categories', (req, res) => {
  try {
    const category = maintenanceService.createCategory(tid(req), req.body);
    res.status(201).json({ success: true, data: category });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

export default router;

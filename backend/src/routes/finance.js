import { Router } from 'express';
import { FinanceService } from '../services/financeService.js';
import { getDb } from '../db/database.js';

const router = Router();
const service = new FinanceService();

router.get('/profit-loss', (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  res.json(service.getProfitLoss(req.tenant.tenantId, month));
});

router.get('/profit-loss/yearly', (req, res) => {
  const year = req.query.year || new Date().getFullYear();
  res.json(service.getYearlySummary(req.tenant.tenantId, year));
});

router.get('/expense-categories', (req, res) => {
  res.json(service.getExpenseCategories(req.tenant.tenantId));
});

router.get('/tax-report', (req, res) => {
  const year = req.query.year || new Date().getFullYear();
  const cycle = req.query.cycle || 'monthly';
  res.json(service.getTaxReport(req.tenant.tenantId, year, cycle));
});

router.get('/vat-cycle', (req, res) => {
  const db = getDb();
  const tenant = db.prepare('SELECT vat_cycle FROM tenants WHERE id = ?').get(req.tenant.tenantId);
  res.json({ cycle: tenant?.vat_cycle || 'monthly' });
});

router.put('/vat-cycle', (req, res) => {
  const db = getDb();
  const { cycle } = req.body;
  if (!['monthly', 'quarterly', 'semiannual', 'annual'].includes(cycle)) {
    return res.status(400).json({ error: 'Invalid cycle' });
  }
  db.prepare('UPDATE tenants SET vat_cycle = ? WHERE id = ?').run(cycle, req.tenant.tenantId);
  res.json({ cycle });
});

export default router;

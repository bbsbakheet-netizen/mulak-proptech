import { Router } from 'express';
import * as accountingService from '../services/accountingService.js';

const router = Router();

function tenantId(req) { return req.tenant?.id || 'default'; }
function userId(req) { return req.user?.id || 'system'; }

// ── Chart of Accounts ─────────────────────────────────────────
router.get('/accounts', (req, res) => {
  try {
    const accounts = accountingService.listAccounts(tenantId(req), req.query.type);
    res.json({ success: true, data: accounts });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/accounts/:id', (req, res) => {
  try {
    const acct = accountingService.getAccount(tenantId(req), req.params.id);
    if (!acct) return res.status(404).json({ success: false, message: 'الحساب غير موجود' });
    res.json({ success: true, data: acct });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/accounts', (req, res) => {
  try {
    const acct = accountingService.createAccount(tenantId(req), req.body);
    res.status(201).json({ success: true, data: acct });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

router.put('/accounts/:id', (req, res) => {
  try {
    const acct = accountingService.updateAccount(tenantId(req), req.params.id, req.body);
    res.json({ success: true, data: acct });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

router.delete('/accounts/:id', (req, res) => {
  try {
    accountingService.deleteAccount(tenantId(req), req.params.id);
    res.json({ success: true, message: 'تم حذف الحساب' });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

router.post('/accounts/seed', (req, res) => {
  try {
    const result = accountingService.seedChartOfAccounts(tenantId(req));
    res.json({ success: true, ...result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Journal Entries ───────────────────────────────────────────
router.get('/entries', (req, res) => {
  try {
    const entries = accountingService.listEntries(tenantId(req), req.query);
    res.json({ success: true, data: entries });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/entries/:id', (req, res) => {
  try {
    const entry = accountingService.getEntry(tenantId(req), req.params.id);
    if (!entry) return res.status(404).json({ success: false, message: 'القيد غير موجود' });
    res.json({ success: true, data: entry });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/entries', (req, res) => {
  try {
    const entry = accountingService.createEntry(tenantId(req), { ...req.body, created_by: userId(req) });
    res.status(201).json({ success: true, data: entry });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

router.post('/entries/:id/post', (req, res) => {
  try {
    const entry = accountingService.postEntry(tenantId(req), req.params.id, userId(req));
    res.json({ success: true, data: entry });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

// ── Financial Reports ─────────────────────────────────────────
router.get('/reports/trial-balance', (req, res) => {
  try {
    const tb = accountingService.trialBalance(tenantId(req), req.query.as_of_date);
    res.json({ success: true, data: tb });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/reports/balance-sheet', (req, res) => {
  try {
    const bs = accountingService.balanceSheet(tenantId(req), req.query.as_of_date);
    res.json({ success: true, data: bs });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/reports/income-statement', (req, res) => {
  try {
    const is = accountingService.incomeStatement(tenantId(req), req.query.from_date, req.query.to_date);
    res.json({ success: true, data: is });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/reports/owners-trust', (req, res) => {
  try {
    const report = accountingService.ownerTrustReport(tenantId(req), req.query.owner_id);
    res.json({ success: true, data: report });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

export default router;

import { Router } from 'express';
import * as ejarService from '../services/ejarService.js';

const router = Router();
function tid(req) { return req.tenant?.id || 'default'; }

// ── Submit contract to Ejar ─────────────────────────────────
router.post('/submit/:contractId', (req, res) => {
  try {
    const result = ejarService.submitToEjar(tid(req), req.params.contractId);
    res.json({ success: true, data: result });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

// ── Check contract status on Ejar ───────────────────────────
router.get('/status/:contractId', (req, res) => {
  try {
    const result = ejarService.checkEjarStatus(tid(req), req.params.contractId);
    res.json({ success: true, data: result });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

// ── Validate contract for Ejar ──────────────────────────────
router.get('/validate/:contractId', (req, res) => {
  try {
    const result = ejarService.validateContractForEjar(tid(req), req.params.contractId);
    res.json({ success: true, data: result });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

// ── List contracts registered on Ejar ───────────────────────
router.get('/contracts', (req, res) => {
  try {
    const contracts = ejarService.listEjarContracts(tid(req), req.query);
    res.json({ success: true, data: contracts });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── List pending (unsubmitted) contracts ────────────────────
router.get('/pending', (req, res) => {
  try {
    const contracts = ejarService.listPendingContracts(tid(req));
    res.json({ success: true, data: contracts });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Ejar stats ──────────────────────────────────────────────
router.get('/stats', (req, res) => {
  try {
    const stats = ejarService.getEjarStats(tid(req));
    res.json({ success: true, data: stats });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Credentials ─────────────────────────────────────────────
router.get('/credentials', (req, res) => {
  try {
    const creds = ejarService.getEjarCredentials(tid(req));
    res.json({ success: true, data: creds });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.put('/credentials', (req, res) => {
  try {
    const result = ejarService.updateEjarCredentials(tid(req), req.body);
    res.json({ success: true, data: result });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

export default router;

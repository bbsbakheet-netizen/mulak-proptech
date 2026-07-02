import { Router } from 'express';
import { FalService } from '../services/falService.js';

const router = Router();
const falService = new FalService();

router.post('/', (req, res) => {
  try {
    const contract = falService.create(req.tenant, req.body);
    res.status(201).json(contract);
  } catch (e) {
    res.status(e.status || 500).json({ error: true, message: e.message || 'فشل إنشاء عقد التسويق' });
  }
});

router.get('/', (req, res) => {
  try {
    const contracts = falService.findAll(req.tenant.tenantId, req.query);
    res.json(contracts);
  } catch (e) {
    res.status(500).json({ error: true, message: e.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const contract = falService.findById(req.tenant.tenantId, req.params.id);
    if (!contract) return res.status(404).json({ error: true, message: 'عقد التسويق غير موجود' });
    res.json(contract);
  } catch (e) {
    res.status(500).json({ error: true, message: e.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const contract = falService.update(req.tenant, req.params.id, req.body);
    if (!contract) return res.status(404).json({ error: true, message: 'عقد التسويق غير موجود' });
    res.json(contract);
  } catch (e) {
    res.status(e.status || 500).json({ error: true, message: e.message });
  }
});

router.put('/:id/activate', (req, res) => {
  try {
    const contract = falService.activate(req.tenant, req.params.id);
    if (!contract) return res.status(404).json({ error: true, message: 'عقد التسويق غير موجود' });
    res.json(contract);
  } catch (e) {
    res.status(500).json({ error: true, message: e.message });
  }
});

router.put('/:id/cancel', (req, res) => {
  try {
    const contract = falService.cancel(req.tenant, req.params.id, req.body.reason);
    if (!contract) return res.status(404).json({ error: true, message: 'عقد التسويق غير موجود' });
    res.json(contract);
  } catch (e) {
    res.status(500).json({ error: true, message: e.message });
  }
});

router.put('/:id/complete', (req, res) => {
  try {
    const contract = falService.complete(req.tenant, req.params.id);
    if (!contract) return res.status(404).json({ error: true, message: 'عقد التسويق غير موجود' });
    res.json(contract);
  } catch (e) {
    res.status(500).json({ error: true, message: e.message });
  }
});

// Fal API integration endpoints
router.post('/:id/submit-to-fal', async (req, res) => {
  try {
    const result = await falService.submitToFal(req.tenant, req.params.id);
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: true, message: e.message });
  }
});

router.get('/:id/fal-status', async (req, res) => {
  try {
    const result = await falService.checkFalStatus(req.tenant, req.params.id);
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: true, message: e.message });
  }
});

export default router;

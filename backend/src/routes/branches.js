import { Router } from 'express';
import * as branchService from '../services/branchService.js';

const router = Router();
function tid(req) { return req.tenant?.id || 'default'; }

router.get('/', (req, res) => {
  try {
    const branches = branchService.listBranches(tid(req));
    res.json({ success: true, data: branches });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/stats', (req, res) => {
  try {
    const stats = branchService.getBranchStats(tid(req));
    res.json({ success: true, data: stats });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/:id', (req, res) => {
  try {
    const branch = branchService.getBranch(tid(req), req.params.id);
    if (!branch) return res.status(404).json({ success: false, message: 'الفرع غير موجود' });
    res.json({ success: true, data: branch });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/', (req, res) => {
  try {
    const branch = branchService.createBranch(tid(req), req.body);
    res.status(201).json({ success: true, data: branch });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

router.put('/:id', (req, res) => {
  try {
    const branch = branchService.updateBranch(tid(req), req.params.id, req.body);
    res.json({ success: true, data: branch });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

router.delete('/:id', (req, res) => {
  try {
    branchService.deleteBranch(tid(req), req.params.id);
    res.json({ success: true, message: 'تم حذف الفرع' });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

export default router;

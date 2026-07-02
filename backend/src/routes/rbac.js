import { Router } from 'express';
import * as rbacService from '../services/rbacService.js';

const router = Router();
function tid(req) { return req.tenant?.id || 'default'; }
function uid(req) { return req.user?.id || 'system'; }

// ── Permissions catalog ─────────────────────────────────────
router.get('/permissions', (req, res) => {
  try {
    res.json({ success: true, data: rbacService.ALL_PERMISSIONS });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Roles CRUD ──────────────────────────────────────────────
router.get('/roles', (req, res) => {
  try {
    const roles = rbacService.listRoles(tid(req));
    res.json({ success: true, data: roles });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/roles/:id', (req, res) => {
  try {
    const role = rbacService.getRole(tid(req), req.params.id);
    if (!role) return res.status(404).json({ success: false, message: 'الدور غير موجود' });
    res.json({ success: true, data: role });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/roles', (req, res) => {
  try {
    const role = rbacService.createRole(tid(req), req.body);
    res.status(201).json({ success: true, data: role });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

router.put('/roles/:id', (req, res) => {
  try {
    const role = rbacService.updateRole(tid(req), req.params.id, req.body);
    res.json({ success: true, data: role });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

router.delete('/roles/:id', (req, res) => {
  try {
    rbacService.deleteRole(tid(req), req.params.id);
    res.json({ success: true, message: 'تم حذف الدور' });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

// ── User Role Assignment ────────────────────────────────────
router.get('/users', (req, res) => {
  try {
    const users = rbacService.getUsersWithRoles(tid(req));
    res.json({ success: true, data: users });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/users/:userId/roles', (req, res) => {
  try {
    const roles = rbacService.getUserRoles(tid(req), req.params.userId);
    res.json({ success: true, data: roles });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/users/:userId/permissions', (req, res) => {
  try {
    const permissions = rbacService.getEffectivePermissions(tid(req), req.params.userId);
    res.json({ success: true, data: permissions });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/assign', (req, res) => {
  try {
    const result = rbacService.assignRole(tid(req), req.body.user_id, req.body.role_id, req.body.branch_id);
    res.json({ success: true, data: result });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

router.delete('/assign/:userId/:roleId', (req, res) => {
  try {
    rbacService.unassignRole(tid(req), req.params.userId, req.params.roleId);
    res.json({ success: true, message: 'تم إلغاء تعيين الدور' });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

// ── Logs ────────────────────────────────────────────────────
router.get('/logs', (req, res) => {
  try {
    const logs = rbacService.getPermissionLogs(tid(req));
    res.json({ success: true, data: logs });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

export default router;

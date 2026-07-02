import { Router } from 'express';
import { getDb } from '../db/database.js';
import { PropertyService } from '../services/propertyService.js';

const router = Router();
const propertyService = new PropertyService();

router.get('/', (req, res) => {
  const db = getDb();
  let sql = 'SELECT u.*, p.name_ar AS property_name_ar, p.name_en AS property_name_en FROM units u JOIN properties p ON p.id = u.property_id WHERE u.tenant_id = ?';
  const params = [req.tenant.tenantId];

  if (req.query.property_id) {
    sql += ' AND u.property_id = ?';
    params.push(req.query.property_id);
  }
  if (req.query.status) {
    sql += ' AND u.status = ?';
    params.push(req.query.status);
  }

  sql += ' ORDER BY u.floor_number ASC, u.unit_number ASC';
  const units = db.prepare(sql).all(...params);
  res.json(units);
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const unit = db.prepare('SELECT u.*, p.name_ar AS property_name_ar, p.name_en AS property_name_en FROM units u JOIN properties p ON p.id = u.property_id WHERE u.id = ? AND u.tenant_id = ?')
    .get(req.params.id, req.tenant.tenantId);
  if (!unit) return res.status(404).json({ error: true, message: 'Not found' });
  res.json(unit);
});

router.put('/:id', (req, res) => {
  const unit = propertyService.updateUnit(req.tenant.tenantId, req.params.id, req.body);
  if (!unit) return res.status(404).json({ error: true, message: 'Unit not found' });
  res.json(unit);
});

export default router;

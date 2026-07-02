import { Router } from 'express';
import { PropertyService } from '../services/propertyService.js';

const router = Router();
const propertyService = new PropertyService();

router.get('/status', (req, res) => {
  res.json({ message: 'Mulak PropTech API v1.0', status: 'running', time: new Date().toISOString() });
});

router.get('/dashboard', (req, res) => {
  const stats = propertyService.getDashboardStats(req.tenant.tenantId);
  const expiring = propertyService.getExpiring?.(req.tenant.tenantId) || [];
  res.json({ stats, expiring });
});

router.post('/', (req, res) => {
  const result = propertyService.create(req.tenant, req.body);
  res.status(201).json(result);
});

router.get('/', (req, res) => {
  const result = propertyService.findAll(req.tenant.tenantId, req.query);
  res.json(result);
});

router.get('/:id', (req, res) => {
  const prop = propertyService.findById(req.tenant.tenantId, req.params.id);
  if (!prop) return res.status(404).json({ error: true, message: 'Property not found' });
  res.json(prop);
});

router.put('/:id', (req, res) => {
  const prop = propertyService.update(req.tenant.tenantId, req.params.id, req.body);
  if (!prop) return res.status(404).json({ error: true, message: 'Property not found' });
  res.json(prop);
});

router.get('/:id/units', (req, res) => {
  const units = propertyService.getUnits(req.tenant.tenantId, req.params.id, req.query.status);
  res.json(units);
});

router.post('/:id/units', (req, res) => {
  const unit = propertyService.addUnit(req.tenant, { ...req.body, property_id: req.params.id });
  res.status(201).json(unit);
});

router.get('/:id/occupancy', (req, res) => {
  const occ = propertyService.getOccupancy(req.tenant.tenantId, req.params.id);
  if (!occ) return res.status(404).json({ error: true, message: 'Property not found' });
  res.json(occ);
});

router.delete('/:id', (req, res) => {
  const result = propertyService.delete(req.tenant.tenantId, req.params.id);
  if (!result) return res.status(404).json({ error: true, message: 'Property not found' });
  res.json(result);
});

export default router;

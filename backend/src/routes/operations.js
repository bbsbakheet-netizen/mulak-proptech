import { Router } from 'express';
import { OperationService } from '../services/operationService.js';

const router = Router();
const operationService = new OperationService();

router.post('/service-contracts', (req, res) => {
  const contract = operationService.createServiceContract(req.tenant, req.body);
  res.status(201).json(contract);
});

router.get('/service-contracts', (req, res) => {
  const contracts = operationService.findAllServiceContracts(req.tenant.tenantId);
  res.json(contracts);
});

router.post('/work-orders', (req, res) => {
  const order = operationService.createWorkOrder(req.tenant, req.body);
  res.status(201).json(order);
});

router.get('/work-orders', (req, res) => {
  const orders = operationService.findAllWorkOrders(req.tenant.tenantId);
  res.json(orders);
});

export default router;

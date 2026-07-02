import { Router } from 'express';
import { ContractService } from '../services/contractService.js';
import { RenterService } from '../services/renterService.js';

const router = Router();
const contractService = new ContractService();
const renterService = new RenterService();

router.post('/', (req, res) => {
  const { renter, ...contractData } = req.body;

  let renterRecord;
  if (renter && renter.national_id) {
    renterRecord = renterService.findOrCreate(req.tenant, renter);
  } else if (contractData.renter_id) {
    renterRecord = renterService.findById(req.tenant.tenantId, contractData.renter_id);
  }

  if (!renterRecord) {
    return res.status(400).json({ error: true, message: 'Renter information required' });
  }

  const contract = contractService.createDraft(req.tenant, {
    ...contractData,
    renter_id: renterRecord.id,
  });

  res.status(201).json(contract);
});

router.get('/', (req, res) => {
  const contracts = contractService.findAllContracts(req.tenant.tenantId, req.query);
  res.json(contracts);
});

router.get('/expiring', (req, res) => {
  const expiring = contractService.getExpiring(req.tenant.tenantId);
  res.json(expiring);
});

router.get('/overdue', (req, res) => {
  const overdue = contractService.getOverduePayments(req.tenant.tenantId);
  res.json(overdue);
});

router.get('/:id', (req, res) => {
  const contract = contractService.findById(req.tenant.tenantId, req.params.id);
  if (!contract) return res.status(404).json({ error: true, message: 'Not found' });
  res.json(contract);
});

router.put('/:id/activate', (req, res) => {
  try {
    const result = contractService.activateContract(req.tenant, req.params.id);
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: true, message: e.message || 'Activation failed' });
  }
});

router.get('/:id/schedule', (req, res) => {
  const schedule = contractService.getSchedule(req.tenant.tenantId, req.params.id);
  res.json(schedule);
});

router.put('/:id/ijar', (req, res) => {
  const contract = contractService.updateIjarStatus(req.tenant.tenantId, req.params.id, req.body);
  if (!contract) return res.status(404).json({ error: true, message: 'Contract not found' });
  res.json(contract);
});

router.put('/:id/najiz', (req, res) => {
  const contract = contractService.updateNajizStatus(req.tenant.tenantId, req.params.id, req.body);
  if (!contract) return res.status(404).json({ error: true, message: 'Contract not found' });
  res.json(contract);
});

export default router;

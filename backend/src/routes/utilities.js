import { Router } from 'express';
import { getDb } from '../db/database.js';
import { UtilityService } from '../services/utilityService.js';

const router = Router();
const service = new UtilityService();

router.get('/dashboard', (req, res) => {
  res.json(service.getUtilityDashboard(req.tenant.tenantId));
});

router.post('/', (req, res) => {
  const bill = service.createBill(req.tenant, req.body);
  res.status(201).json(bill);
});

router.get('/', (req, res) => {
  res.json(service.findAllBills(req.tenant.tenantId, req.query));
});

router.get('/:id', (req, res) => {
  const bill = service.findBillById(req.tenant.tenantId, req.params.id);
  if (!bill) return res.status(404).json({ error: true, message: 'Bill not found' });
  res.json(bill);
});

router.put('/:id', (req, res) => {
  const bill = service.updateBill(req.tenant.tenantId, req.params.id, req.body);
  if (!bill) return res.status(404).json({ error: true, message: 'Bill not found' });
  res.json(bill);
});

router.post('/:id/sync-gov', (req, res) => {
  const bill = service.findBillById(req.tenant.tenantId, req.params.id);
  if (!bill) return res.status(404).json({ error: true, message: 'Bill not found' });
  const result = service.syncWithGovernment(req.tenant.tenantId, req.params.id, bill.utility_type);
  res.json(result);
});

router.post('/sync-all', (req, res) => {
  const result = service.syncAllUnits(req.tenant.tenantId);
  res.json(result);
});

// Simulated fetch bills by meter numbers from government platforms
router.post('/fetch-by-meter', (req, res) => {
  const db = getDb();
  const { unit_id, utility_type } = req.body;
  if (!unit_id) return res.status(400).json({ error: 'unit_id is required' });

  const unit = db.prepare('SELECT * FROM units WHERE id = ? AND tenant_id = ?').get(unit_id, req.tenant.tenantId);
  if (!unit) return res.status(404).json({ error: 'Unit not found' });

  const meterNo = utility_type === 'water' ? unit.water_meter_no
    : utility_type === 'gas' ? unit.gas_meter_no
    : unit.electricity_meter_no;
  if (!meterNo) return res.status(400).json({ error: 'No meter number found for this utility type' });

  // Simulate fetching from government platform (mocked data)
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const consumption = Math.round(100 + Math.random() * 900);
  const rate = utility_type === 'water' ? 2.5 : utility_type === 'gas' ? 1.2 : 0.18;
  const fixed = utility_type === 'water' ? 20 : utility_type === 'gas' ? 15 : 30;
  const amount = Math.round((consumption * rate + fixed) * 100) / 100;
  const vat = Math.round(amount * 0.15 * 100) / 100;
  const provider = utility_type === 'water' ? 'الشركة الوطنية للمياه'
    : utility_type === 'gas' ? 'شركة الغاز'
    : 'الشركة السعودية للكهرباء';

  const billData = {
    utility_type: utility_type || 'electricity',
    property_id: unit.property_id,
    unit_id,
    provider_name: provider,
    bill_date: `${year}-${month}-01`,
    due_date: `${year}-${month}-25`,
    consumption_amount: consumption,
    consumption_unit: utility_type === 'water' ? 'm³' : utility_type === 'gas' ? 'm³' : 'kWh',
    unit_rate: rate,
    fixed_charges: fixed,
    amount,
    vat_amount: vat,
    payment_status: 'pending',
    meter_number: meterNo,
  };

  const saved = service.createBill(req.tenant, billData);
  res.json({ fetched: true, meter: meterNo, bill: saved, message: `تم جلب وحفظ الفاتورة من ${provider} للعداد ${meterNo}` });
});

export default router;

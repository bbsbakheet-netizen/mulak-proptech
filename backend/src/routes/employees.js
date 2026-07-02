import { Router } from 'express';
import { EmployeeService } from '../services/employeeService.js';

const router = Router();
const employeeService = new EmployeeService();

router.post('/', (req, res) => {
  const emp = employeeService.create(req.tenant, req.body);
  res.status(201).json(emp);
});

router.get('/', (req, res) => {
  const employees = employeeService.findAll(req.tenant.tenantId);
  res.json(employees);
});

router.get('/active', (req, res) => {
  const employees = employeeService.findActive(req.tenant.tenantId);
  res.json(employees);
});

router.post('/payroll', (req, res) => {
  const month = req.body.month || new Date().toISOString().slice(0, 7);
  const result = employeeService.calculatePayroll(req.tenant, month);
  res.json({ lines: result, month, totalEmployees: result.length });
});

export default router;

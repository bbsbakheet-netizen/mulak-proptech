import { getDb } from '../db/database.js';
import { generateId, generateEmployeeNumber, now } from './helpers.js';

export class EmployeeService {
  create(tenant, data) {
    const db = getDb();
    const id = generateId();
    const employeeNumber = generateEmployeeNumber(tenant.tenantId, db);

    db.prepare(`
      INSERT INTO employees (id, tenant_id, employee_number, national_id, id_type,
        full_name_ar, full_name_en, job_title_ar, job_title_en, department,
        property_id, hire_date, basic_salary, housing_allowance, transport_allowance,
        other_allowances, bank_name, iban, gosi_number, nationality, is_saudi,
        commission_type, commission_rate, phone, email)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, tenant.tenantId, employeeNumber, data.national_id, data.id_type || 'national',
      data.full_name_ar, data.full_name_en || null,
      data.job_title_ar || null, data.job_title_en || null,
      data.department || null, data.property_id || null,
      data.hire_date || new Date().toISOString().split('T')[0],
      data.basic_salary || 0, data.housing_allowance || 0,
      data.transport_allowance || 0, data.other_allowances || 0,
      data.bank_name || null, data.iban || null,
      data.gosi_number || null, data.nationality || 'SA',
      data.is_saudi !== undefined ? (data.is_saudi ? 1 : 0) : 1,
      data.commission_type || 'none', data.commission_rate || 0,
      data.phone || null, data.email || null
    );

    return db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
  }

  findAll(tenantId) {
    const db = getDb();
    return db.prepare(
      'SELECT * FROM employees WHERE tenant_id = ? ORDER BY created_at DESC'
    ).all(tenantId);
  }

  findActive(tenantId) {
    const db = getDb();
    return db.prepare(
      "SELECT * FROM employees WHERE tenant_id = ? AND status = 'active' ORDER BY full_name_ar"
    ).all(tenantId);
  }

  calculatePayroll(tenant, month) {
    const db = getDb();
    const employees = db.prepare(
      "SELECT * FROM employees WHERE tenant_id = ? AND status = 'active'"
    ).all(tenant.tenantId);

    const runId = generateId();
    db.prepare(`
      INSERT INTO payroll_runs (id, tenant_id, payroll_month, run_date,
        total_employees, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(runId, tenant.tenantId, month, now(), employees.length, tenant.userId);

    let totalBasic = 0, totalAllowances = 0, totalDeductions = 0, totalNet = 0;

    const insertLine = db.prepare(`
      INSERT INTO payroll_lines (id, tenant_id, payroll_run_id, employee_id,
        basic_salary, housing_allowance, transport_allowance, other_allowances,
        gosi_employee, gosi_employer, net_salary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const processPayroll = db.transaction(() => {
      for (const emp of employees) {
        const gross = emp.basic_salary + emp.housing_allowance +
          emp.transport_allowance + emp.other_allowances;
        const gosiEmployee = emp.is_saudi ? emp.basic_salary * 0.10 : emp.basic_salary * 0.01;
        const gosiEmployer = emp.is_saudi ? emp.basic_salary * 0.12 : emp.basic_salary * 0.02;
        const netSalary = Math.round(gross - gosiEmployee);

        insertLine.run(
          generateId(), tenant.tenantId, runId, emp.id,
          emp.basic_salary, emp.housing_allowance, emp.transport_allowance,
          emp.other_allowances, Math.round(gosiEmployee), Math.round(gosiEmployer), netSalary
        );

        totalBasic += emp.basic_salary;
        totalAllowances += emp.housing_allowance + emp.transport_allowance + emp.other_allowances;
        totalDeductions += gosiEmployee;
        totalNet += netSalary;
      }
    });

    processPayroll();

    db.prepare(`
      UPDATE payroll_runs SET total_basic = ?, total_allowances = ?,
        total_deductions = ?, total_net = ?, status = 'draft'
      WHERE id = ?
    `).run(totalBasic, totalAllowances, totalDeductions, totalNet, runId);

    return db.prepare(`
      SELECT pr.*, pl.*, e.full_name_ar, e.employee_number, e.iban, e.bank_name
      FROM payroll_runs pr
      JOIN payroll_lines pl ON pl.payroll_run_id = pr.id
      JOIN employees e ON e.id = pl.employee_id
      WHERE pr.id = ?
    `).all(runId);
  }
}

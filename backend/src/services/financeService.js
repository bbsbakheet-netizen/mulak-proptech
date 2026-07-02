import { getDb } from '../db/database.js';
import { generateId, now } from './helpers.js';

export class FinanceService {
  getProfitLoss(tenantId, yearMonth) {
    const db = getDb();
    const month = yearMonth || new Date().toISOString().slice(0, 7);
    const year = month.slice(0, 4);

    const income = db.prepare(`
      SELECT
        COALESCE(SUM(total_amount), 0) AS total_income,
        COUNT(*) AS receipt_count
      FROM receipts
      WHERE tenant_id = ? AND payment_date LIKE ? AND approval_status = 'approved'
        AND (is_cancelled IS NULL OR is_cancelled = 0)
    `).get(tenantId, `${month}%`);

    const utilityExpenses = db.prepare(`
      SELECT
        COALESCE(SUM(total_amount), 0) AS total,
        COUNT(*) AS count
      FROM utility_bills
      WHERE tenant_id = ? AND bill_date LIKE ?
    `).get(tenantId, `${month}%`);

    const purchaseExpenses = db.prepare(`
      SELECT
        COALESCE(SUM(total_amount), 0) AS total,
        COUNT(*) AS count
      FROM purchase_orders
      WHERE tenant_id = ? AND order_date LIKE ? AND status IN ('received', 'confirmed')
        AND (expense_category IS NULL OR expense_category != 'commission')
    `).get(tenantId, `${month}%`);

    const commissionExpenses = db.prepare(`
      SELECT
        COALESCE(SUM(total_amount), 0) AS total,
        COUNT(*) AS count
      FROM purchase_orders
      WHERE tenant_id = ? AND order_date LIKE ? AND status IN ('received', 'confirmed')
        AND expense_category = 'commission'
    `).get(tenantId, `${month}%`);

    const payrollExpenses = db.prepare(`
      SELECT
        COALESCE(SUM(total_net), 0) AS total,
        COUNT(*) AS count
      FROM payroll_runs
      WHERE tenant_id = ? AND payroll_month = ? AND status = 'approved'
    `).get(tenantId, month);

    const serviceContractExpenses = db.prepare(`
      SELECT
        COALESCE(SUM(annual_value / 12), 0) AS monthly_total,
        COUNT(*) AS count
      FROM operational_contracts
      WHERE tenant_id = ? AND status = 'active'
    `).get(tenantId);

    const totalExpenses = (utilityExpenses.total || 0) + (purchaseExpenses.total || 0)
      + (commissionExpenses.total || 0) + (payrollExpenses.total || 0) + (serviceContractExpenses.monthly_total || 0);
    const netProfit = (income.total_income || 0) - totalExpenses;

    const incomeByType = db.prepare(`
      SELECT payment_method, COALESCE(SUM(total_amount), 0) AS total
      FROM receipts
      WHERE tenant_id = ? AND payment_date LIKE ? AND approval_status = 'approved'
        AND (is_cancelled IS NULL OR is_cancelled = 0)
      GROUP BY payment_method
    `).all(tenantId, `${month}%`);

    const expensesByType = [];
    if (utilityExpenses.total > 0) {
      expensesByType.push({ type: 'فواتير الخدمات', total: utilityExpenses.total, count: utilityExpenses.count });
    }
    if (purchaseExpenses.total > 0) {
      expensesByType.push({ type: 'المشتريات', total: purchaseExpenses.total, count: purchaseExpenses.count });
    }
    if (payrollExpenses.total > 0) {
      expensesByType.push({ type: 'الرواتب', total: payrollExpenses.total, count: payrollExpenses.count });
    }
    if (serviceContractExpenses.monthly_total > 0) {
      expensesByType.push({ type: 'عقود الخدمات', total: serviceContractExpenses.monthly_total, count: serviceContractExpenses.count });
    }
    if (commissionExpenses.total > 0) {
      expensesByType.push({ type: 'عمولات', total: commissionExpenses.total, count: commissionExpenses.count });
    }

    const utilityBreakdown = db.prepare(`
      SELECT utility_type, COALESCE(SUM(total_amount), 0) AS total, COUNT(*) AS count
      FROM utility_bills
      WHERE tenant_id = ? AND bill_date LIKE ?
      GROUP BY utility_type
    `).all(tenantId, `${month}%`);

    const purchaseCategoryBreakdown = db.prepare(`
      SELECT COALESCE(expense_category, 'inventory') AS category, COALESCE(SUM(total_amount), 0) AS total, COUNT(*) AS count
      FROM purchase_orders
      WHERE tenant_id = ? AND order_date LIKE ? AND status IN ('received', 'confirmed')
      GROUP BY expense_category
    `).all(tenantId, `${month}%`);

    return {
      month,
      period: { year, month },
      income: {
        total: income.total_income || 0,
        count: income.receipt_count || 0,
        byType: incomeByType
      },
      expenses: {
        total: totalExpenses,
        items: expensesByType,
        utilityBreakdown,
        purchaseCategoryBreakdown
      },
      netProfit,
      profitMargin: income.total_income > 0 ? Math.round((netProfit / income.total_income) * 100) : 0,
      isProfitable: netProfit >= 0,
      basis: 'accrual'
    };
  }

  getYearlySummary(tenantId, year) {
    const db = getDb();
    const yr = year || new Date().getFullYear();

    const monthlyData = [];
    for (let m = 1; m <= 12; m++) {
      const month = `${yr}-${String(m).padStart(2, '0')}`;
      monthlyData.push(this.getProfitLoss(tenantId, month));
    }

    const totals = monthlyData.reduce((acc, m) => {
      acc.income += m.income.total;
      acc.expenses += m.expenses.total;
      acc.profit += m.netProfit;
      return acc;
    }, { income: 0, expenses: 0, profit: 0 });

    return { year, months: monthlyData, totals };
  }

  getTaxReport(tenantId, year, cycle) {
    const db = getDb();
    const yr = year || new Date().getFullYear();
    const months = [];
    for (let m = 1; m <= 12; m++) {
      const month = `${yr}-${String(m).padStart(2, '0')}`;
      // Output VAT from approved receipts
      const outputVat = db.prepare(`
        SELECT COALESCE(SUM(vat_amount), 0) AS vat
        FROM receipts
        WHERE tenant_id = ? AND payment_date LIKE ? AND approval_status = 'approved'
          AND (is_cancelled IS NULL OR is_cancelled = 0)
      `).get(tenantId, `${month}%`).vat;
      // Input VAT from received/confirmed purchase orders
      const inputVat = db.prepare(`
        SELECT COALESCE(SUM(vat_amount), 0) AS vat
        FROM purchase_orders
        WHERE tenant_id = ? AND order_date LIKE ? AND status IN ('received', 'confirmed')
      `).get(tenantId, `${month}%`).vat;
      // Zero-rated income (e.g. residential rent may be exempt; for now track separately)
      const zeroRatedSales = db.prepare(`
        SELECT COALESCE(SUM(total_amount), 0) AS total
        FROM receipts
        WHERE tenant_id = ? AND payment_date LIKE ? AND approval_status = 'approved'
          AND (is_cancelled IS NULL OR is_cancelled = 0) AND vat_amount = 0
      `).get(tenantId, `${month}%`).total;

      months.push({
        month,
        outputVat,
        inputVat,
        netVat: outputVat - inputVat,
        zeroRatedSales,
      });
    }
    const totals = months.reduce((a, m) => ({
      outputVat: a.outputVat + m.outputVat,
      inputVat: a.inputVat + m.inputVat,
      netVat: a.netVat + m.netVat,
      zeroRatedSales: a.zeroRatedSales + m.zeroRatedSales,
    }), { outputVat: 0, inputVat: 0, netVat: 0, zeroRatedSales: 0 });

    const cycleLabel = cycle || 'monthly';
    let cycles = [];
    if (cycleLabel === 'annual') {
      const cy = { label: `السنة ${yr}`, months: months.map(m => m.month), ...totals };
      cycles = [cy];
    } else if (cycleLabel === 'semiannual') {
      const halves = [[1, 6], [7, 12]];
      cycles = halves.map(([start, end]) => {
        const mons = months.slice(start - 1, end);
        return {
          label: `${start === 1 ? 'الأول' : 'الثاني'} نصف ${yr}`,
          months: mons.map(m => m.month),
          outputVat: mons.reduce((s, m) => s + m.outputVat, 0),
          inputVat: mons.reduce((s, m) => s + m.inputVat, 0),
          netVat: mons.reduce((s, m) => s + m.netVat, 0),
          zeroRatedSales: mons.reduce((s, m) => s + m.zeroRatedSales, 0),
        };
      });
    } else if (cycleLabel === 'quarterly') {
      const quarters = [[1, 3], [4, 6], [7, 9], [10, 12]];
      cycles = quarters.map(([start, end], i) => {
        const mons = months.slice(start - 1, end);
        return {
          label: `الربع ${['الأول', 'الثاني', 'الثالث', 'الرابع'][i]} ${yr}`,
          months: mons.map(m => m.month),
          outputVat: mons.reduce((s, m) => s + m.outputVat, 0),
          inputVat: mons.reduce((s, m) => s + m.inputVat, 0),
          netVat: mons.reduce((s, m) => s + m.netVat, 0),
          zeroRatedSales: mons.reduce((s, m) => s + m.zeroRatedSales, 0),
        };
      });
    } else {
      cycles = months.map(m => ({
        label: m.month,
        months: [m.month],
        outputVat: m.outputVat,
        inputVat: m.inputVat,
        netVat: m.netVat,
        zeroRatedSales: m.zeroRatedSales,
      }));
    }

    // Write tax records for each cycle
    const tx = db.transaction(() => {
      for (const cy of cycles) {
        const periodStart = cy.months[0];
        const periodEnd = cy.months[cy.months.length - 1];
        const dueDate = calculateDueDate(periodEnd);
        const existing = db.prepare(
          'SELECT id FROM tax_records WHERE tenant_id = ? AND record_type = ? AND tax_period = ?'
        ).get(tenantId, 'vat_return', periodStart);
        if (!existing) {
          db.prepare(`
            INSERT INTO tax_records (id, tenant_id, record_type, reference_id, reference_type,
              tax_period, taxable_amount, tax_rate, tax_amount, status, due_date, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            generateId(), tenantId, 'vat_return', periodStart, 'vat_cycle',
            periodStart, cy.outputVat, 15, cy.netVat,
            cy.netVat > 0 ? 'pending_payment' : 'pending_refund',
            dueDate,
            `ضريبة القيمة المضافة - ${cy.label}`
          );
        }
      }
    });
    tx();

    return {
      year,
      cycle: cycleLabel,
      months,
      cycles,
      totals,
      zotcaStandard: true,
      note: 'ضريبة القيمة المضافة 15% - تحتسب فقط على الإيصالات المعتمدة والمشتريات المستلمة'
    };
  }

  getExpenseCategories(tenantId) {
    const db = getDb();
    const utilities = db.prepare(`
      SELECT utility_type AS name, COALESCE(SUM(total_amount), 0) AS total
      FROM utility_bills WHERE tenant_id = ? AND payment_status IN ('paid', 'pending')
      GROUP BY utility_type
    `).all(tenantId);

    const byCategory = utilities.map(u => ({
      name: u.name,
      total: u.total,
      percentage: 0
    }));
    const grandTotal = byCategory.reduce((s, c) => s + c.total, 0);
    byCategory.forEach(c => { c.percentage = grandTotal > 0 ? Math.round((c.total / grandTotal) * 100) : 0; });

    return { categories: byCategory, total: grandTotal };
  }
}

function calculateDueDate(periodEnd) {
  const d = new Date(periodEnd + '-01');
  d.setMonth(d.getMonth() + 2);
  d.setDate(1);
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}
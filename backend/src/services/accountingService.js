import { getDb } from '../db/database.js';
import { generateId } from './helpers.js';

// ── Chart of Accounts ─────────────────────────────────────────
export function listAccounts(tenantId, type) {
  const db = getDb();
  let query = `SELECT * FROM chart_of_accounts WHERE tenant_id = ?`;
  const params = [tenantId];
  if (type) { query += ` AND account_type = ?`; params.push(type); }
  query += ` ORDER BY account_code`;
  return db.prepare(query).all(...params);
}

export function getAccount(tenantId, id) {
  const db = getDb();
  return db.prepare(`SELECT * FROM chart_of_accounts WHERE id = ? AND tenant_id = ?`).get(id, tenantId);
}

export function createAccount(tenantId, data) {
  const db = getDb();
  const id = generateId();
  if (!data.account_code || !data.account_name_ar) throw new Error('رمز الحساب والاسم مطلوبان');
  const existing = db.prepare(`SELECT id FROM chart_of_accounts WHERE tenant_id = ? AND account_code = ?`).get(tenantId, data.account_code);
  if (existing) throw new Error('رمز الحساب موجود مسبقاً');
  db.prepare(`
    INSERT INTO chart_of_accounts (id, tenant_id, account_code, account_name_ar, account_name_en, account_type, parent_id, description, is_system)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, tenantId, data.account_code, data.account_name_ar, data.account_name_en || data.account_name_ar,
    data.account_type, data.parent_id || null, data.description || '', data.is_system ? 1 : 0);
  return getAccount(tenantId, id);
}

export function updateAccount(tenantId, id, data) {
  const db = getDb();
  const acct = getAccount(tenantId, id);
  if (!acct) throw new Error('الحساب غير موجود');
  if (acct.is_system) throw new Error('لا يمكن تعديل حساب نظامي');
  db.prepare(`
    UPDATE chart_of_accounts SET account_name_ar=?, account_name_en=?, account_type=?,
      parent_id=?, description=?, is_active=?, updated_at=datetime('now')
    WHERE id=? AND tenant_id=?
  `).run(data.account_name_ar || acct.account_name_ar, data.account_name_en || acct.account_name_en,
    data.account_type || acct.account_type, data.parent_id || acct.parent_id,
    data.description !== undefined ? data.description : acct.description,
    data.is_active !== undefined ? (data.is_active ? 1 : 0) : acct.is_active,
    id, tenantId);
  return getAccount(tenantId, id);
}

export function deleteAccount(tenantId, id) {
  const db = getDb();
  const acct = getAccount(tenantId, id);
  if (!acct) throw new Error('الحساب غير موجود');
  if (acct.is_system) throw new Error('لا يمكن حذف حساب نظامي');
  const children = db.prepare(`SELECT COUNT(*) AS cnt FROM chart_of_accounts WHERE parent_id = ?`).get(id);
  if (children.cnt > 0) throw new Error('لا يمكن حذف حساب لديه حسابات فرعية');
  db.prepare(`DELETE FROM chart_of_accounts WHERE id=? AND tenant_id=?`).run(id, tenantId);
  return { deleted: true };
}

// ── Journal Entries ───────────────────────────────────────────
export function listEntries(tenantId, filters = {}) {
  const db = getDb();
  let query = `SELECT je.*, u1.full_name_ar AS created_by_name FROM journal_entries je LEFT JOIN users u1 ON u1.id = je.created_by WHERE je.tenant_id = ?`;
  const params = [tenantId];
  if (filters.from_date) { query += ` AND je.entry_date >= ?`; params.push(filters.from_date); }
  if (filters.to_date) { query += ` AND je.entry_date <= ?`; params.push(filters.to_date); }
  if (filters.is_posted !== undefined) { query += ` AND je.is_posted = ?`; params.push(filters.is_posted ? 1 : 0); }
  query += ` ORDER BY je.entry_date DESC, je.created_at DESC LIMIT 100`;
  return db.prepare(query).all(...params);
}

export function getEntry(tenantId, id) {
  const db = getDb();
  const entry = db.prepare(`SELECT je.*, u1.full_name_ar AS created_by_name FROM journal_entries je LEFT JOIN users u1 ON u1.id = je.created_by WHERE je.id = ? AND je.tenant_id = ?`).get(id, tenantId);
  if (!entry) return null;
  const lines = db.prepare(`
    SELECT jl.*, ca.account_code, ca.account_name_ar
    FROM journal_lines jl
    JOIN chart_of_accounts ca ON ca.id = jl.account_id
    WHERE jl.entry_id = ?
    ORDER BY jl.id
  `).all(id);
  return { ...entry, lines };
}

export function createEntry(tenantId, data) {
  const db = getDb();
  const id = generateId();
  const entryNo = `JE-${Date.now()}`;
  let totalDebit = 0, totalCredit = 0;
  for (const line of data.lines || []) {
    totalDebit += (line.debit || 0);
    totalCredit += (line.credit || 0);
    if (!line.account_id) throw new Error('رقم الحساب مطلوب لكل بند');
  }
  if (Math.abs(totalDebit - totalCredit) > 0.01) throw new Error(`القيد غير متوازن: المدين ${totalDebit} ≠ الدائن ${totalCredit}`);
  if (totalDebit === 0) throw new Error('القيد لا يمكن أن يكون صفراً');

  const txn = db.transaction(() => {
    db.prepare(`
      INSERT INTO journal_entries (id, tenant_id, entry_number, entry_date, reference_type, reference_id, description_ar, description_en, total_debit, total_credit, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, tenantId, entryNo, data.entry_date || new Date().toISOString().split('T')[0],
      data.reference_type || null, data.reference_id || null,
      data.description_ar || '', data.description_en || '',
      totalDebit, totalCredit, data.created_by || 'system');
    for (const line of data.lines) {
      db.prepare(`
        INSERT INTO journal_lines (id, entry_id, account_id, description, debit, credit)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(generateId(), id, line.account_id, line.description || '', line.debit || 0, line.credit || 0);
    }
  });
  txn();
  return getEntry(tenantId, id);
}

export function postEntry(tenantId, id, userId) {
  const db = getDb();
  const entry = getEntry(tenantId, id);
  if (!entry) throw new Error('القيد غير موجود');
  if (entry.is_posted) throw new Error('القيد مُرحَّل مسبقاً');
  db.prepare(`
    UPDATE journal_entries SET is_posted=1, posted_at=datetime('now'), posted_by=?, updated_at=datetime('now')
    WHERE id=? AND tenant_id=?
  `).run(userId || 'system', id, tenantId);
  return getEntry(tenantId, id);
}

// ── Financial Reports ─────────────────────────────────────────
export function trialBalance(tenantId, asOfDate) {
  const db = getDb();
  const date = asOfDate || new Date().toISOString().split('T')[0];
  return db.prepare(`
    SELECT ca.id, ca.account_code, ca.account_name_ar, ca.account_type,
      COALESCE(SUM(jl.debit), 0) AS total_debit,
      COALESCE(SUM(jl.credit), 0) AS total_credit,
      CASE WHEN ca.account_type IN ('asset','expense') THEN COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)
           ELSE COALESCE(SUM(jl.credit), 0) - COALESCE(SUM(jl.debit), 0)
      END AS balance
    FROM chart_of_accounts ca
    JOIN journal_lines jl ON jl.account_id = ca.id
    JOIN journal_entries je ON je.id = jl.entry_id AND je.is_posted = 1 AND je.tenant_id = ?
    WHERE ca.tenant_id = ? AND je.entry_date <= ?
    GROUP BY ca.id
    ORDER BY ca.account_code
  `).all(tenantId, tenantId, date);
}

export function balanceSheet(tenantId, asOfDate) {
  const tb = trialBalance(tenantId, asOfDate);
  return {
    assets: tb.filter(a => a.account_type === 'asset'),
    liabilities: tb.filter(a => a.account_type === 'liability'),
    equity: tb.filter(a => a.account_type === 'equity'),
    total_assets: tb.filter(a => a.account_type === 'asset').reduce((s, a) => s + a.balance, 0),
    total_liabilities: tb.filter(a => a.account_type === 'liability').reduce((s, a) => s + a.balance, 0),
    total_equity: tb.filter(a => a.account_type === 'equity').reduce((s, a) => s + a.balance, 0),
  };
}

export function incomeStatement(tenantId, fromDate, toDate) {
  const db = getDb();
  const to = toDate || new Date().toISOString().split('T')[0];
  const from = fromDate || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
  const data = db.prepare(`
    SELECT ca.id, ca.account_code, ca.account_name_ar, ca.account_type,
      COALESCE(SUM(jl.credit - jl.debit), 0) AS amount
    FROM chart_of_accounts ca
    JOIN journal_lines jl ON jl.account_id = ca.id
    JOIN journal_entries je ON je.id = jl.entry_id AND je.is_posted = 1 AND je.tenant_id = ?
    WHERE ca.tenant_id = ? AND ca.account_type IN ('income','expense') AND je.entry_date BETWEEN ? AND ?
    GROUP BY ca.id
    ORDER BY ca.account_code
  `).all(tenantId, tenantId, from, to);
  const income = data.filter(d => d.account_type === 'income');
  const expense = data.filter(d => d.account_type === 'expense');
  const totalIncome = income.reduce((s, d) => s + d.amount, 0);
  const totalExpense = expense.reduce((s, d) => s + d.amount, 0);
  return {
    from_date: from, to_date: to,
    income, expense,
    total_income: totalIncome,
    total_expense: totalExpense,
    net_profit: totalIncome - totalExpense,
  };
}

export function ownerTrustReport(tenantId, ownerId) {
  const db = getDb();
  const trustAccounts = db.prepare(`
    SELECT ta.*, ca.account_code, ca.account_name_ar, o.full_name_ar AS owner_name
    FROM trust_accounts ta
    JOIN chart_of_accounts ca ON ca.id = ta.account_id
    JOIN owners o ON o.id = ta.owner_id
    WHERE ta.tenant_id = ? ${ownerId ? 'AND ta.owner_id = ?' : ''}
  `).all(tenantId, ...(ownerId ? [ownerId] : []));

  const receipts = ownerId ? db.prepare(`
    SELECT r.*, rc.contract_number, p.name_ar AS property_name
    FROM receipts r
    LEFT JOIN rental_contracts rc ON rc.id = r.contract_id
    LEFT JOIN units u ON u.id = r.unit_id
    LEFT JOIN properties p ON p.id = u.property_id
    WHERE r.owner_id = ? AND r.trust_status = 'pending'
    ORDER BY r.payment_date DESC LIMIT 50
  `).all(ownerId) : [];

  return { trustAccounts, pendingReceipts: receipts };
}

// ── Seed default chart of accounts ────────────────────────────
export function seedChartOfAccounts(tenantId) {
  const db = getDb();
  const existing = db.prepare(`SELECT COUNT(*) AS cnt FROM chart_of_accounts WHERE tenant_id = ?`).get(tenantId);
  if (existing.cnt > 0) return { seeded: false, message: 'دليل الحسابات موجود مسبقاً' };

  const accounts = [
    { code: '1000', name_ar: 'النقدية', name_en: 'Cash', type: 'asset', system: 1 },
    { code: '1100', name_ar: 'الحسابات البنكية', name_en: 'Bank Accounts', type: 'asset', system: 1 },
    { code: '1110', name_ar: 'بنك الراجحي', name_en: 'Al-Rajhi Bank', type: 'asset', parent: '1100' },
    { code: '1120', name_ar: 'بنك الأهلي', name_en: 'National Bank', type: 'asset', parent: '1100' },
    { code: '1200', name_ar: 'حسابات الأمانة (أموال الملاك)', name_en: 'Trust Accounts', type: 'asset', system: 1 },
    { code: '1300', name_ar: 'حسابات العملاء', name_en: 'Accounts Receivable', type: 'asset', system: 1 },
    { code: '1400', name_ar: 'الأصول العقارية', name_en: 'Real Estate Assets', type: 'asset', system: 1 },
    { code: '1500', name_ar: 'معدات وأثاث', name_en: 'Equipment & Furniture', type: 'asset' },
    { code: '1600', name_ar: 'مصروفات مدفوعة مقدماً', name_en: 'Prepaid Expenses', type: 'asset' },
    { code: '2000', name_ar: 'حسابات الموردين', name_en: 'Accounts Payable', type: 'liability', system: 1 },
    { code: '2100', name_ar: 'حسابات الملاك (مستحق الدفع)', name_en: 'Owner Payable', type: 'liability', system: 1 },
    { code: '2200', name_ar: 'ضريبة القيمة المضافة', name_en: 'VAT Payable', type: 'liability', system: 1 },
    { code: '2300', name_ar: 'مصروفات مستحقة', name_en: 'Accrued Expenses', type: 'liability' },
    { code: '2400', name_ar: 'إيرادات مؤجلة', name_en: 'Deferred Revenue', type: 'liability' },
    { code: '3000', name_ar: 'رأس المال', name_en: 'Capital', type: 'equity', system: 1 },
    { code: '3100', name_ar: 'الأرباح المحتجزة', name_en: 'Retained Earnings', type: 'equity', system: 1 },
    { code: '3200', name_ar: 'أرباح الفترة', name_en: 'Current Period Profit', type: 'equity' },
    { code: '4000', name_ar: 'إيرادات الإيجارات', name_en: 'Rental Income', type: 'income', system: 1 },
    { code: '4100', name_ar: 'رسوم الإدارة', name_en: 'Management Fees', type: 'income', system: 1 },
    { code: '4200', name_ar: 'عمولات الوساطة', name_en: 'Brokerage Commissions', type: 'income' },
    { code: '4300', name_ar: 'إيرادات أخرى', name_en: 'Other Income', type: 'income' },
    { code: '5000', name_ar: 'الرواتب والأجور', name_en: 'Salaries & Wages', type: 'expense', system: 1 },
    { code: '5100', name_ar: 'فواتير الخدمات', name_en: 'Utilities', type: 'expense', system: 1 },
    { code: '5200', name_ar: 'الصيانة والتشغيل', name_en: 'Maintenance & Operations', type: 'expense', system: 1 },
    { code: '5300', name_ar: 'التسويق والإعلان', name_en: 'Marketing & Advertising', type: 'expense' },
    { code: '5400', name_ar: 'إيجار المقر', name_en: 'Office Rent', type: 'expense' },
    { code: '5500', name_ar: 'مصروفات مكتبية', name_en: 'Office Expenses', type: 'expense' },
    { code: '5600', name_ar: 'مصروفات قانونية واستشارية', name_en: 'Legal & Consulting', type: 'expense' },
    { code: '5700', name_ar: 'الإهلاك', name_en: 'Depreciation', type: 'expense' },
    { code: '5800', name_ar: 'مصروفات حكومية', name_en: 'Government Fees', type: 'expense' },
    { code: '5900', name_ar: 'مصروفات أخرى', name_en: 'Other Expenses', type: 'expense' },
  ];

  const insert = db.prepare(`
    INSERT INTO chart_of_accounts (id, tenant_id, account_code, account_name_ar, account_name_en, account_type, parent_id, is_system)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const txn = db.transaction(() => {
    for (const a of accounts) {
      const parentId = a.parent ? db.prepare(`SELECT id FROM chart_of_accounts WHERE tenant_id=? AND account_code=?`).get(tenantId, a.parent)?.id : null;
      insert.run(generateId(), tenantId, a.code, a.name_ar, a.name_en, a.type, parentId, a.system ? 1 : 0);
    }
  });
  txn();
  return { seeded: true, count: accounts.length };
}

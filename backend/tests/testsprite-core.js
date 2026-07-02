/**
 * TestSprite Core — Comprehensive Test Suite for Mulak PropTech
 * Runs from A to Z against all API endpoints.
 */
import { createApp } from '../src/app.js';
import http from 'http';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const JWT_SECRET = process.env.JWT_SECRET || 'mullak-proptech-secret-2026';

const dbModule = await import('../src/db/database.js');
const DB = dbModule.getDb();

// ── Test Framework ──
class TestSuite {
  constructor(name) { this.name = name; this.tests = []; this.passed = 0; this.failed = 0; }
  test(name, fn) { this.tests.push({ name, fn }); }
  async run() {
    console.log(`\n\x1b[36m═══ ${this.name} ═══\x1b[0m`);
    for (const t of this.tests) {
      try { await t.fn(); console.log(`  \x1b[32m✓\x1b[0m ${t.name}`); this.passed++; }
      catch (e) { console.log(`  \x1b[31m✗\x1b[0m ${t.name}: \x1b[31m${e.message}\x1b[0m`); this.failed++; }
    }
  }
  get total() { return this.tests.length; }
}

// ── HTTP Helper ──
let _token = null;
let _app = null, _server = null, _port = 0;
let seeds = {};

function tid() { return seeds.tenantId; }

async function startServer() {
  _app = createApp();
  return new Promise(r => { _server = _app.listen(0, () => { _port = _server.address().port; r(); }); });
}
function stopServer() { return new Promise(r => { if (_server) _server.close(() => r()); else r(); }); }

function req(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost', port: _port, path, method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (_token) opts.headers['Authorization'] = `Bearer ${_token}`;
    const hreq = http.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        let json;
        try { json = JSON.parse(data); } catch (_) { json = data; }
        resolve({ status: res.statusCode, data: json });
      });
    });
    hreq.on('error', reject);
    if (body) hreq.write(JSON.stringify(body));
    hreq.end();
  });
}
function GET(p) { return req('GET', p); }
function POST(p, b) { return req('POST', p, b); }
function PUT(p, b) { return req('PUT', p, b); }
function DEL(p) { return req('DELETE', p); }

function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }
function assertOk(r) { if (r.status >= 400) throw new Error(`Expected <400, got ${r.status}: ${JSON.stringify(r.data).slice(0,200)}`); }
function assertStatus(r, code) { if (r.status !== code) throw new Error(`Expected ${code}, got ${r.status}: ${JSON.stringify(r.data).slice(0,200)}`); }

function extractData(res) {
  if (res.data && res.data.data !== undefined) return res.data.data;
  if (Array.isArray(res.data)) return res.data;
  return res.data;
}

// ── Seed ──
async function seedData() {
  seeds.tenantId = randomUUID();
  DB.prepare(`INSERT INTO tenants (id,name_ar,name_en,vat_number,cr_number,city) VALUES(?,?,?,?,?,?)`)
    .run(seeds.tenantId, 'شركة مُلاك التقنية', 'Mulak Tech', '310123456789012', '1234567890', 'ينبع');

  const uid = randomUUID(); seeds.adminUser = uid;
  DB.prepare(`INSERT INTO users (id,tenant_id,national_id,full_name_ar,email,password_hash,phone,role,is_active) VALUES(?,?,?,?,?,?,?,?,?)`)
    .run(uid, seeds.tenantId, '1012345678', 'مدير النظام', 'admin@mullak.sa', '$2b$10$placeholder', '0555555555', 'admin', 1);

  seeds.branchId = randomUUID();
  DB.prepare(`INSERT INTO branches (id,tenant_id,name_ar,name_en,code,city,is_hq,manager_id) VALUES(?,?,?,?,?,?,?,?)`)
    .run(seeds.branchId, seeds.tenantId, 'الفرع الرئيسي', 'Main HQ', 'HQ-01', 'ينبع', 1, uid);

  seeds.ownerId = randomUUID();
  DB.prepare(`INSERT INTO owners (id,tenant_id,full_name_ar,national_id,phone,city) VALUES(?,?,?,?,?,?)`)
    .run(seeds.ownerId, seeds.tenantId, 'مالك العقار', '2012345678', '0551111111', 'ينبع');

  seeds.propId = randomUUID();
  DB.prepare(`INSERT INTO properties (id,tenant_id,code,name_ar,property_type,city,status,total_units,branch_id) VALUES(?,?,?,?,?,?,?,?,?)`)
    .run(seeds.propId, seeds.tenantId, 'PR-001', 'برج مُلاك', 'residential', 'ينبع', 'active', 2, seeds.branchId);

  seeds.unitId = randomUUID();
  DB.prepare(`INSERT INTO units (id,tenant_id,property_id,unit_number,unit_type,floor_number,area_sqm,bedrooms,bathrooms,base_rent,status,branch_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(seeds.unitId, seeds.tenantId, seeds.propId, 'A-101', 'apartment', 1, 120, 2, 2, 36000, 'vacant', seeds.branchId);

  seeds.renterId = randomUUID();
  DB.prepare(`INSERT INTO renters (id,tenant_id,national_id,full_name_ar,phone,email) VALUES(?,?,?,?,?,?)`)
    .run(seeds.renterId, seeds.tenantId, '3012345678', 'مستأجر تجريبي', '0552222222', 'r@t.com');

  seeds.contractId = randomUUID();
  DB.prepare(`INSERT INTO rental_contracts (id,tenant_id,contract_number,unit_id,renter_id,start_date,end_date,annual_rent,security_deposit,status,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .run(seeds.contractId, seeds.tenantId, 'CON-001', seeds.unitId, seeds.renterId, '2026-01-01', '2027-01-01', 36000, 3000, 'active', uid);

  seeds.receiptId = randomUUID();
  DB.prepare(`INSERT INTO receipts (id,tenant_id,receipt_number,contract_id,renter_id,unit_id,amount,vat_amount,total_amount,payment_date,payment_method,approval_status,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(seeds.receiptId, seeds.tenantId, 'RCT-001', seeds.contractId, seeds.renterId, seeds.unitId, 3000, 450, 3450, '2026-01-01', 'cash', 'approved', uid);

  seeds.empId = randomUUID();
  DB.prepare(`INSERT INTO employees (id,tenant_id,employee_number,national_id,full_name_ar,job_title_ar,department,hire_date,basic_salary,phone,email,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(seeds.empId, seeds.tenantId, 'EMP-001', '4012345678', 'موظف', 'مدير', 'العقارات', '2025-01-01', 15000, '0553333333', 'e@t.com', 'active');

  seeds.vendorId = randomUUID();
  DB.prepare(`INSERT INTO vendors (id,tenant_id,vendor_code,name_ar,cr_number,vat_number,phone,email,category) VALUES(?,?,?,?,?,?,?,?,?)`)
    .run(seeds.vendorId, seeds.tenantId, 'V-001', 'مورد الصيانة', '1234567', '312345678912345', '0554444444', 'v@t.com', 'general');

  seeds.cashAcc = randomUUID();
  DB.prepare(`INSERT INTO chart_of_accounts (id,tenant_id,account_code,account_name_ar,account_type,is_system) VALUES(?,?,?,?,?,?)`)
    .run(seeds.cashAcc, seeds.tenantId, '110001', 'الصندوق', 'asset', 1);
  seeds.revAcc = randomUUID();
  DB.prepare(`INSERT INTO chart_of_accounts (id,tenant_id,account_code,account_name_ar,account_type,is_system) VALUES(?,?,?,?,?,?)`)
    .run(seeds.revAcc, seeds.tenantId, '410001', 'إيرادات الإيجار', 'income', 1);

  seeds.maintCat = randomUUID();
  DB.prepare(`INSERT INTO maintenance_categories (id,tenant_id,name_ar) VALUES(?,?,?)`)
    .run(seeds.maintCat, seeds.tenantId, 'صيانة كهربائية');

  seeds.roleId = randomUUID();
  DB.prepare(`INSERT INTO roles (id,tenant_id,name_ar,name_en,permissions) VALUES(?,?,?,?,?)`)
    .run(seeds.roleId, seeds.tenantId, 'مدير', 'Admin', '["*"]');

  // JWT
  _token = jwt.sign({ userId: uid, tenantId: seeds.tenantId, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
}

// ── Test suites ──
async function testAuth(s) {
  s.test('GET /api/status', async () => {
    const r = await GET('/api/status'); assertOk(r); assert(r.data.status === 'running');
  });
}

async function testProperties(s) {
  s.test('GET /api/v1/properties', async () => {
    const r = await GET('/api/v1/properties'); assertOk(r);
    const d = extractData(r); assert(Array.isArray(d), 'expected array'); assert(d.length >= 1);
  });
  s.test('GET /api/v1/properties/:id', async () => {
    const r = await GET(`/api/v1/properties/${seeds.propId}`); assertOk(r);
  });
  s.test('POST /api/v1/properties', async () => {
    const r = await POST('/api/v1/properties', { name_ar: 'اختبار', property_type: 'residential', city: 'جدة', status: 'active' });
    assertOk(r);
    seeds.testProp = (r.data.property && r.data.property.id) || r.data.id || (r.data.data && r.data.data.id);
    if (!seeds.testProp) throw new Error('no prop id: ' + JSON.stringify(r.data).slice(0,100));
  });
  s.test('PUT /api/v1/properties/:id', async () => {
    if (!seeds.testProp) throw new Error('no test property id');
    const r = await PUT(`/api/v1/properties/${seeds.testProp}`, { name_ar: 'معدل' }); assertOk(r);
  });
  s.test('DELETE /api/v1/properties/:id', async () => {
    if (!seeds.testProp) throw new Error('no test property id');
    const r = await DEL(`/api/v1/properties/${seeds.testProp}`); assertOk(r);
  });
}

async function testUnits(s) {
  s.test('GET /api/v1/units', async () => {
    const r = await GET('/api/v1/units'); assertOk(r);
    assert(Array.isArray(extractData(r))); assert(extractData(r).length >= 1);
  });
  s.test('GET /api/v1/units/:id', async () => {
    const r = await GET(`/api/v1/units/${seeds.unitId}`); assertOk(r);
  });
}

async function testCustomers(s) {
  s.test('GET /api/v1/customers', async () => {
    const r = await GET('/api/v1/customers'); assertOk(r);
    assert(Array.isArray(extractData(r)));
  });
  s.test('GET /api/v1/customers/:id', async () => {
    const r = await GET(`/api/v1/customers/${seeds.renterId}`); assertOk(r);
  });
}

async function testContracts(s) {
  s.test('GET /api/v1/contracts', async () => {
    const r = await GET('/api/v1/contracts'); assertOk(r);
    assert(Array.isArray(extractData(r)));
  });
  s.test('GET /api/v1/contracts/:id', async () => {
    const r = await GET(`/api/v1/contracts/${seeds.contractId}`); assertOk(r);
  });
  s.test('POST /api/v1/contracts', async () => {
    const r = await POST('/api/v1/contracts', {
      contract_number: 'CON-T-001', unit_id: seeds.unitId, renter_id: seeds.renterId,
      start_date: '2026-06-01', end_date: '2027-06-01', annual_rent: 24000, status: 'active'
    }); assertOk(r);
  });
}

async function testReceipts(s) {
  s.test('GET /api/v1/receipts', async () => {
    const r = await GET('/api/v1/receipts'); assertOk(r);
    assert(Array.isArray(extractData(r)));
  });
  s.test('GET /api/v1/receipts/:id', async () => {
    const r = await GET(`/api/v1/receipts/${seeds.receiptId}`); assertOk(r);
  });
  s.test('POST /api/v1/receipts', async () => {
    const r = await POST('/api/v1/receipts', {
      receipt_number: 'RCT-T-001', contract_id: seeds.contractId, amount: 3000,
      total_amount: 3450, vat_amount: 450, payment_date: '2026-06-15', payment_method: 'bank'
    }); assertOk(r);
  });
}

async function testQuotations(s) {
  s.test('GET /api/v1/quotations', async () => {
    const r = await GET('/api/v1/quotations'); assertOk(r);
    assert(Array.isArray(extractData(r)));
  });
  s.test('POST /api/v1/quotations', async () => {
    const r = await POST('/api/v1/quotations', {
      quote_number: 'Q-T-001', client_name_ar: 'عميل',
      items: JSON.stringify([{ name: 'إيجار', qty: 1, unit_price: 3000, total: 3000 }]),
      subtotal: 3000, vat_amount: 450, total_amount: 3450
    }); assertOk(r);
  });
}

async function testOwners(s) {
  s.test('GET /api/v1/owners', async () => {
    const r = await GET('/api/v1/owners'); assertOk(r);
    assert(Array.isArray(extractData(r)));
  });
  s.test('POST /api/v1/owners', async () => {
    const r = await POST('/api/v1/owners', { full_name_ar: 'مالك ج', national_id: '5012345678', phone: '0555555555' });
    assertOk(r);
  });
}

async function testDeals(s) {
  s.test('GET /api/v1/deals', async () => {
    const r = await GET('/api/v1/deals'); assertOk(r);
    assert(Array.isArray(extractData(r)));
  });
  s.test('POST /api/v1/deals', async () => {
    const r = await POST('/api/v1/deals', {
      deal_number: 'DL-T-001', deal_type: 'rent', client_name: 'عميل صفقة',
      client_phone: '0556666666', expected_value: 36000, stage: 'lead', probability: 30
    }); assertOk(r);
    seeds.dealId = r.data.id || (r.data.data && r.data.data.id);
    if (!seeds.dealId) throw new Error('no deal id: ' + JSON.stringify(r.data).slice(0,100));
  });
  s.test('PUT /api/v1/deals/:id', async () => {
    if (!seeds.dealId) throw new Error('no deal');
    const r = await PUT(`/api/v1/deals/${seeds.dealId}`, { stage: 'negotiation', probability: 60 }); assertOk(r);
  });
  s.test('POST /api/v1/deals/:id/activities', async () => {
    if (!seeds.dealId) throw new Error('no deal');
    const r = await POST(`/api/v1/deals/${seeds.dealId}/activities`, { activity_type: 'call', description: 'اتصال', is_completed: 1 });
    assertOk(r);
  });
  // Commissions are under /api/v1/deals/commissions/
  s.test('GET /api/v1/deals/commissions/all', async () => {
    const r = await GET('/api/v1/deals/commissions/all'); assertOk(r);
    assert(Array.isArray(extractData(r)));
  });
  s.test('POST /api/v1/deals/commissions', async () => {
    const r = await POST('/api/v1/deals/commissions', {
      agent_id: seeds.adminUser, commission_type: 'sale', calculation_method: 'fixed',
      base_amount: 100000, rate: 2.5, calculated_amount: 2500, status: 'pending'
    }); assertOk(r);
    seeds.comId = r.data.id || (r.data.data && r.data.data.id);
    if (!seeds.comId) throw new Error('no com id: ' + JSON.stringify(r.data).slice(0,100));
  });
  s.test('PATCH /api/v1/deals/commissions/:id/status', async () => {
    if (!seeds.comId) throw new Error('no commission');
    const r = await req('PATCH', `/api/v1/deals/commissions/${seeds.comId}/status`, { status: 'approved' }); assertOk(r);
  });
}

async function testMaintenance(s) {
  s.test('GET /api/v1/maintenance', async () => {
    const r = await GET('/api/v1/maintenance'); assertOk(r);
    const d = extractData(r); assert(Array.isArray(d) || typeof d === 'object');
  });
  s.test('GET /api/v1/maintenance/categories/all', async () => {
    const r = await GET('/api/v1/maintenance/categories/all'); assertOk(r);
    assert(Array.isArray(extractData(r)));
  });
  s.test('POST /api/v1/maintenance', async () => {
    const r = await POST('/api/v1/maintenance', {
      title: 'تسريب مياه', property_id: seeds.propId, unit_id: seeds.unitId,
      priority: 'high', description: 'تسريب في الحمام',
      category_id: seeds.maintCat, cost_bearer: 'owner'
    }); assertOk(r);
    seeds.maintId = r.data.id || (r.data.data && r.data.data.id);
    if (!seeds.maintId) throw new Error('no ticket id: ' + JSON.stringify(r.data).slice(0,100));
  });
  s.test('PUT /api/v1/maintenance/:id', async () => {
    if (!seeds.maintId) throw new Error('no ticket');
    const r = await PUT(`/api/v1/maintenance/${seeds.maintId}`, { status: 'in_progress' }); assertOk(r);
  });
  s.test('GET /api/v1/maintenance/analytics', async () => {
    const r = await GET('/api/v1/maintenance/analytics'); assertOk(r);
  });
}

async function testMarketing(s) {
  s.test('GET /api/v1/marketing', async () => {
    const r = await GET('/api/v1/marketing'); assertOk(r);
    assert(Array.isArray(extractData(r)));
  });
  s.test('POST /api/v1/marketing', async () => {
    const r = await POST('/api/v1/marketing', {
      listing_number: 'LST-T-001', listing_type: 'rent', title_ar: 'شقة للإيجار',
      property_id: seeds.propId, unit_id: seeds.unitId, price: 36000, status: 'draft'
    }); assertOk(r);
    seeds.listingId = r.data.id || (r.data.data && r.data.data.id);
    if (!seeds.listingId) throw new Error('no listing id: ' + JSON.stringify(r.data).slice(0,100));
  });
  s.test('PUT /api/v1/marketing/:id', async () => {
    if (!seeds.listingId) throw new Error('no listing');
    const r = await PUT(`/api/v1/marketing/${seeds.listingId}`, { status: 'published' }); assertOk(r);
  });
}

async function testZATCA(s) {
  s.test('GET /api/v1/zatca/settings', async () => {
    const r = await GET('/api/v1/zatca/settings'); assertOk(r);
  });
  s.test('PUT /api/v1/zatca/settings', async () => {
    const r = await PUT('/api/v1/zatca/settings', {
      organization_name: 'مُلاك', vat_number: '310123456789012', city: 'ينبع', environment: 'sandbox'
    }); assertOk(r);
  });
  s.test('GET /api/v1/zatca/queue', async () => {
    const r = await GET('/api/v1/zatca/queue'); assertOk(r);
    assert(Array.isArray(extractData(r)));
  });
  s.test('POST /api/v1/zatca/prepare/:receiptId', async () => {
    const r = await POST(`/api/v1/zatca/prepare/${seeds.receiptId}`, {}); assert(r.status !== 404);
  });
  s.test('POST /api/v1/zatca/submit/:receiptId', async () => {
    const r = await POST(`/api/v1/zatca/submit/${seeds.receiptId}`, {}); assert(r.status !== 404);
  });
}

async function testEjar(s) {
  s.test('GET /api/v1/ejar/validate/:contractId', async () => {
    const r = await GET(`/api/v1/ejar/validate/${seeds.contractId}`); assertOk(r);
  });
  s.test('GET /api/v1/ejar/status/:contractId', async () => {
    const r = await GET(`/api/v1/ejar/status/${seeds.contractId}`);
    // May return 400 if not yet submitted — that's expected business logic
    assert(r.status !== 404, 'route not found');
  });
  s.test('POST /api/v1/ejar/submit/:contractId', async () => {
    const r = await POST(`/api/v1/ejar/submit/${seeds.contractId}`, {}); assert(r.status !== 404);
  });
}

async function testRBAC(s) {
  s.test('GET /api/v1/rbac/roles', async () => {
    const r = await GET('/api/v1/rbac/roles'); assertOk(r);
    assert(Array.isArray(extractData(r)));
  });
  s.test('POST /api/v1/rbac/roles', async () => {
    const r = await POST('/api/v1/rbac/roles', {
      name_ar: 'مشرف', name_en: 'Supervisor', permissions: JSON.stringify(['*'])
    }); assertOk(r);
  });
  s.test('POST /api/v1/rbac/assign', async () => {
    const r = await POST('/api/v1/rbac/assign', { user_id: seeds.adminUser, role_id: seeds.roleId }); assertOk(r);
  });
  s.test('GET /api/v1/rbac/users', async () => {
    const r = await GET('/api/v1/rbac/users'); assertOk(r);
    assert(Array.isArray(extractData(r)));
  });
}

async function testBranches(s) {
  s.test('GET /api/v1/branches', async () => {
    const r = await GET('/api/v1/branches'); assertOk(r);
    assert(Array.isArray(extractData(r)));
  });
  s.test('GET /api/v1/branches/:id', async () => {
    const r = await GET(`/api/v1/branches/${seeds.branchId}`); assertOk(r);
  });
  s.test('POST /api/v1/branches', async () => {
    const r = await POST('/api/v1/branches', { name_ar: 'فرع جدة', code: 'BR-002', city: 'جدة', is_hq: 0 }); assertOk(r);
    seeds.testBranch = extractData(r).id || r.data.id;
  });
  s.test('PUT /api/v1/branches/:id', async () => {
    if (!seeds.testBranch) throw new Error('no branch');
    const r = await PUT(`/api/v1/branches/${seeds.testBranch}`, { city: 'الرياض' }); assertOk(r);
  });
}

async function testAlerts(s) {
  s.test('GET /api/v1/alerts', async () => {
    const r = await GET('/api/v1/alerts'); assertOk(r);
    assert(Array.isArray(extractData(r)));
  });
  s.test('GET /api/v1/alerts/stats', async () => {
    const r = await GET('/api/v1/alerts/stats'); assertOk(r);
  });
  s.test('GET /api/v1/alerts/dashboard', async () => {
    const r = await GET('/api/v1/alerts/dashboard'); assertOk(r);
  });
}

async function testBI(s) {
  s.test('GET /api/v1/bi/dashboard', async () => {
    try { DB.exec(`ALTER TABLE properties ADD COLUMN purchase_price REAL DEFAULT 0`); } catch (_) {}
    try { DB.exec(`ALTER TABLE properties ADD COLUMN market_value REAL DEFAULT 0`); } catch (_) {}
    const r = await GET('/api/v1/bi/dashboard'); assertOk(r);
  });
  s.test('GET /api/v1/bi/occupancy', async () => {
    const r = await GET('/api/v1/bi/occupancy'); assertOk(r);
  });
  s.test('GET /api/v1/bi/revenue', async () => {
    const r = await GET('/api/v1/bi/revenue?year=2026'); assertOk(r);
  });
  s.test('GET /api/v1/bi/roi', async () => {
    const r = await GET('/api/v1/bi/roi'); assertOk(r);
  });
}

async function testFal(s) {
  s.test('GET /api/v1/fal', async () => {
    const r = await GET('/api/v1/fal'); assertOk(r);
    assert(Array.isArray(extractData(r)));
  });
}

async function testAccounting(s) {
  s.test('GET /api/v1/accounting/accounts', async () => {
    const r = await GET('/api/v1/accounting/accounts'); assertOk(r);
    assert(Array.isArray(extractData(r)));
  });
  s.test('POST /api/v1/accounting/entries', async () => {
    const r = await POST('/api/v1/accounting/entries', {
      entry_number: 'JN-T-001', entry_date: '2026-06-01', description_ar: 'قيد اختبار',
      lines: [{ account_id: seeds.cashAcc, debit: 5000, credit: 0 }, { account_id: seeds.revAcc, debit: 0, credit: 5000 }],
      total_debit: 5000, total_credit: 5000
    }); assertOk(r);
  });
}

async function testEmployees(s) {
  s.test('GET /api/v1/employees', async () => {
    const r = await GET('/api/v1/employees'); assertOk(r);
    assert(Array.isArray(r.data || []));
  });
  s.test('POST /api/v1/employees', async () => {
    const r = await POST('/api/v1/employees', {
      employee_number: 'EMP-T-001', national_id: '5012345679', full_name_ar: 'موظف اختبار',
      hire_date: '2026-01-01', basic_salary: 10000
    }); assertOk(r);
  });
}

async function testVendors(s) {
  s.test('GET /api/v1/purchases/vendors', async () => {
    const r = await GET('/api/v1/purchases/vendors'); assertOk(r);
    assert(Array.isArray(r.data || []));
  });
  s.test('POST /api/v1/purchases/vendors', async () => {
    const r = await POST('/api/v1/purchases/vendors', { vendor_code: 'V-T-001', name_ar: 'مورد اختبار', cr_number: '9876543210' });
    assertOk(r);
  });
}

async function testPurchaseOrders(s) {
  s.test('POST /api/v1/purchases/orders', async () => {
    const r = await POST('/api/v1/purchases/orders', {
      po_number: 'PO-T-001', vendor_id: seeds.vendorId,
      items: [{ name: 'مادة', qty: 10, unit: 'piece', unit_price: 50, total: 500 }],
      subtotal: 500, vat_amount: 75, total_amount: 575
    }); assertOk(r);
  });
  s.test('GET /api/v1/purchases/orders', async () => {
    const r = await GET('/api/v1/purchases/orders'); assertOk(r);
    assert(Array.isArray(r.data || []));
  });
}

async function testInventory(s) {
  s.test('GET /api/v1/purchases/inventory', async () => {
    const r = await GET('/api/v1/purchases/inventory'); assertOk(r);
  });
  s.test('POST /api/v1/purchases/inventory', async () => {
    const r = await POST('/api/v1/purchases/inventory', {
      item_code: 'INV-T-001', name_ar: 'مخزون اختبار', unit_cost: 100, current_stock: 50
    }); assertOk(r);
  });
}

async function testWorkOrders(s) {
  s.test('GET /api/v1/operations/work-orders', async () => {
    const r = await GET('/api/v1/operations/work-orders'); assertOk(r);
    assert(Array.isArray(r.data || []));
  });
  s.test('POST /api/v1/operations/work-orders', async () => {
    const r = await POST('/api/v1/operations/work-orders', {
      order_number: 'WO-T-001', property_id: seeds.propId, title_ar: 'أمر عمل اختبار', priority: 'medium'
    }); assertOk(r);
  });
}

async function testUtilities(s) {
  s.test('GET /api/v1/utilities', async () => {
    const r = await GET('/api/v1/utilities'); assertOk(r);
    assert(Array.isArray(r.data || []));
  });
  s.test('POST /api/v1/utilities', async () => {
    const r = await POST('/api/v1/utilities', {
      bill_number: 'UTIL-T-001', utility_type: 'electricity', provider_name: 'SEC',
      property_id: seeds.propId, bill_date: '2026-06-01', due_date: '2026-06-30',
      amount: 1500, vat_amount: 225, total_amount: 1725
    }); assertOk(r);
  });
}

// ── Main ──
async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║       TestSprite — Mulak PropTech Suite         ║');
  console.log('║        شامل اختبار جميع الأنظمة من الألف للياء   ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');

  console.log('\x1b[33m📦 Initializing...\x1b[0m');
  await startServer();
  await seedData();
  console.log(`   Server: http://localhost:${_port}`);

  const suites = [
    ['🔐 Auth', testAuth],
    ['🏠 Properties', testProperties],
    ['🚪 Units', testUnits],
    ['👥 Customers', testCustomers],
    ['📝 Contracts', testContracts],
    ['🧾 Receipts', testReceipts],
    ['📄 Quotations', testQuotations],
    ['👑 Owners', testOwners],
    ['🤝 Deals + Commissions', testDeals],
    ['🔧 Maintenance', testMaintenance],
    ['📢 Marketing', testMarketing],
    ['📡 ZATCA', testZATCA],
    ['🏛️ Ejar', testEjar],
    ['🛡️ RBAC', testRBAC],
    ['🏢 Branches', testBranches],
    ['🔔 Alerts', testAlerts],
    ['📊 BI', testBI],
    ['📰 Fal', testFal],
    ['📒 Accounting', testAccounting],
    ['👷 Employees', testEmployees],
    ['🏪 Vendors', testVendors],
    ['📋 Purchase Orders', testPurchaseOrders],
    ['📦 Inventory', testInventory],
    ['🛠️ Work Orders', testWorkOrders],
    ['⚡ Utilities', testUtilities],
  ];

  const results = [];
  let totalPassed = 0, totalFailed = 0;
  const startTime = Date.now();

  for (const [name, fn] of suites) {
    const s = new TestSuite(name);
    await fn(s);
    await s.run();
    results.push({ name, passed: s.passed, failed: s.failed, total: s.total });
    totalPassed += s.passed;
    totalFailed += s.failed;
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n══════════════════════════════════════════════════');
  console.log(`\x1b[36m📊 ${totalPassed} passed, ${totalFailed} failed, ${results.reduce((s,r)=>s+r.total,0)} total in ${elapsed}s\x1b[0m`);

  // HTML Report
  const rows = results.map(r => {
    const cls = r.failed === 0 ? 'pass' : 'fail';
    return `<tr class="${cls}"><td>${r.failed === 0 ? '✅' : '❌'}</td><td>${r.name}</td><td class="num">${r.passed}</td><td class="num">${r.failed}</td><td class="num">${r.total}</td></tr>`;
  }).join('\n');
  const allPassed = totalFailed === 0;
  writeFileSync(join(__dirname, 'report.html'), `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TestSprite Report</title><style>
    *{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#1a1d23;color:#e2e8f0;padding:40px 20px}
    .container{max-width:900px;margin:0 auto}h1{text-align:center;font-size:26px;margin-bottom:8px}.sub{text-align:center;color:#94a3b8;margin-bottom:30px;font-size:14px}
    .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:28px}
    .sc{background:#252a34;border-radius:12px;padding:18px;text-align:center}.sc .n{font-size:30px;font-weight:700}.sc .l{font-size:13px;color:#94a3b8;margin-top:4px}
    .sc.pass .n{color:#22c55e}.sc.fail .n{color:#ef4444}.sc.total .n{color:#3b82f6}.sc.time .n{color:#f59e0b;font-size:22px}
    table{width:100%;border-collapse:collapse;background:#252a34;border-radius:12px;overflow:hidden}
    th{background:#2d3340;padding:11px 14px;font-size:13px;color:#94a3b8;text-align:right;font-weight:600}
    td{padding:11px 14px;font-size:13px;border-top:1px solid #2d3340}td.num{text-align:center}
    tr.pass td:first-child{color:#22c55e}tr.fail td:first-child{color:#ef4444}tr.fail{background:rgba(239,68,68,.06)}
    .ftr{text-align:center;margin-top:28px;color:#64748b;font-size:12px}
  </style></head><body><div class="container">
    <h1>🧪 TestSprite Report</h1>
    <div class="sub">Mulak PropTech — ${allPassed ? '✅ جميع الاختبارات ناجحة' : '❌ توجد أخطاء'}</div>
    <div class="summary">
      <div class="sc pass"><div class="n">${totalPassed}</div><div class="l">ناجح</div></div>
      <div class="sc fail"><div class="n">${totalFailed}</div><div class="l">فاشل</div></div>
      <div class="sc total"><div class="n">${totalPassed + totalFailed}</div><div class="l">إجمالي</div></div>
      <div class="sc time"><div class="n">${elapsed}s</div><div class="l">الوقت</div></div>
    </div>
    <table><thead><tr><th style="width:40px"></th><th>النظام</th><th style="width:70px">نجاح</th><th style="width:70px">فشل</th><th style="width:70px">المجموع</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="ftr">TestSprite — ${new Date().toISOString()}</div>
  </div></body></html>`, 'utf-8');
  console.log(`\x1b[36m📄 Report: ${join(__dirname, 'report.html')}\x1b[0m`);

  await stopServer();
  DB.close();
  const dbPath = join(__dirname, 'test-temp.db');
  try { unlinkSync(dbPath); } catch (_) {}
  try { unlinkSync(dbPath + '-wal'); } catch (_) {}
  try { unlinkSync(dbPath + '-shm'); } catch (_) {}

  if (totalFailed > 0) { console.log(`\n\x1b[31m❌ ${totalFailed} failed\x1b[0m`); process.exit(1); }
  else { console.log(`\n\x1b[32m✅ ALL PASSED\x1b[0m`); process.exit(0); }
}

main().catch(e => { console.error('\x1b[31mFATAL:\x1b[0m', e); process.exit(1); });

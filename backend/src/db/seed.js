import { getDb, closeDb } from './database.js';
import { generateId } from '../services/helpers.js';
import bcrypt from 'bcryptjs';

const T = {
  TENANT_ID: 'default',
  USER_ID: 'system',
};

function seed() {
  const db = getDb();

  console.log('🌱 Seeding database...');

  // 1. Tenant
  db.prepare(`
    INSERT OR IGNORE INTO tenants (id, name_ar, name_en, cr_number, vat_number, phone, email, city, subscription_plan)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(T.TENANT_ID, 'شركة الأملاك المتحدة العقارية', 'Mullak United Real Estate Co.',
    '1010000000', '300000000000003', '0555000000', 'info@mullak.sa', 'ينبع', 'professional');

  // 2. Admin user with password
  const adminPassword = bcrypt.hashSync('admin123', 10);
  db.prepare(`
    INSERT OR IGNORE INTO users (id, tenant_id, national_id, full_name_ar, full_name_en, email, password_hash, role, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(T.USER_ID, T.TENANT_ID, '1000000001', 'محمد الأحمدي', 'Mohammed Al-Ahmadi',
    'admin@mullak.sa', adminPassword, 'owner', 1);

  // 3. Properties
  const properties = [
    { id: generateId(), name_ar: 'برج النخيل', name_en: 'Al-Nakheel Tower', type: 'residential', city: 'ينبع', district: 'حي الشاطئ', deed: '12345678', floors: 12, total: 20 },
    { id: generateId(), name_ar: 'فندق الربوة', name_en: 'Al-Rabwah Hotel', type: 'hotel', city: 'ينبع', district: 'حي الروضة', deed: '87654321', floors: 8, total: 18 },
    { id: generateId(), name_ar: 'أبراج الواحة', name_en: 'Al-Waha Towers', type: 'residential', city: 'ينبع', district: 'حي الواحة', deed: '11223344', floors: 10, total: 8 },
    { id: generateId(), name_ar: 'مجمع الأمل', name_en: 'Al-Amal Complex', type: 'mixed', city: 'ينبع', district: 'حي الأمل', deed: '44332211', floors: 6, total: 6 },
  ];

  const insertProp = db.prepare(`
    INSERT OR IGNORE INTO properties (id, tenant_id, name_ar, name_en, property_type, city, district, deed_number, floors_count, total_units)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const p of properties) {
    insertProp.run(p.id, T.TENANT_ID, p.name_ar, p.name_en, p.type, p.city, p.district, p.deed, p.floors, p.total);
    // Generate units for this property
    const perFloor = Math.ceil(p.total / p.floors);
    const unitType = p.type === 'hotel' ? 'hotel_room' : p.type === 'commercial' ? 'office' : 'apartment';
    for (let i = 1; i <= p.total; i++) {
      const fl = Math.ceil(i / perFloor);
      const seq = ((i - 1) % perFloor) + 1;
      const num = `${fl}${String(seq).padStart(2, '0')}`;
      const rent = p.type === 'hotel' ? 7000 : 4500 + Math.floor(Math.random() * 2000);
      const status = i <= Math.floor(p.total * 0.7) ? 'occupied' : (i % 5 === 0 ? 'maintenance' : 'vacant');
      db.prepare(`
        INSERT OR IGNORE INTO units (id, tenant_id, property_id, unit_number, unit_type, floor_number, base_rent, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(generateId(), T.TENANT_ID, p.id, num, unitType, fl, rent, status);
    }
  }

  // 4. Renters
  const renterNames = ['أحمد الغامدي', 'ليلى المالكي', 'فهد القحطاني', 'نورة السهلي', 'سارة المطيري', 'عمر الحربي', 'خالد الحربي'];
  const renterIds = [];
  for (let i = 0; i < renterNames.length; i++) {
    const id = generateId();
    renterIds.push(id);
    db.prepare(`
      INSERT OR IGNORE INTO renters (id, tenant_id, national_id, full_name_ar, phone, email)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, T.TENANT_ID, `10${i + 1}00000001`, renterNames[i],
      `05${String(50000000 + i)}`, `${renterNames[i]}@email.com`);
  }

  // 5. Contracts
  const occupiedUnits = db.prepare("SELECT * FROM units WHERE status = 'occupied' LIMIT 4").all();
  for (let i = 0; i < occupiedUnits.length && i < renterIds.length; i++) {
    const u = occupiedUnits[i];
    const startDate = `2026-${String(i + 1).padStart(2, '0')}-10`;
    const endDate = `2027-${String(7 + i).padStart(2, '0')}-10`;
    const annualRent = u.base_rent * 12;
    const contractId = generateId();
    const contractNum = `RC-2026-${String(i + 1).padStart(5, '0')}`;

    db.prepare(`
      INSERT OR IGNORE INTO rental_contracts (id, tenant_id, contract_number, unit_id, renter_id,
        start_date, end_date, annual_rent, security_deposit, payment_frequency,
        installments_count, ijar_contract_id, ijar_status, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(contractId, T.TENANT_ID, contractNum, u.id, renterIds[i],
      startDate, endDate, annualRent, Math.round(annualRent / 12), 'monthly', 12,
      i < 2 ? `IJAR-${10000 + i}` : null, i < 2 ? 'active' : 'pending',
      'active', T.USER_ID);

    // Generate payment schedules
    for (let m = 1; m <= 12; m++) {
      const dueDate = new Date(startDate);
      dueDate.setMonth(dueDate.getMonth() + m - 1);
      const dueStr = dueDate.toISOString().split('T')[0];
      const amount = annualRent / 12;
      db.prepare(`
        INSERT OR IGNORE INTO payment_schedules (id, tenant_id, contract_id, installment_no, due_date, amount, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(generateId(), T.TENANT_ID, contractId, m, dueStr, amount,
        m <= 5 ? 'paid' : 'pending');
    }

    // Generate receipts for the first 3 paid installments (for demo data)
    for (let m = 1; m <= 3; m++) {
      const id = generateId();
      const receiptNum = `RCP-2026-${String(m + i * 5).padStart(5, '0')}`;
      const amount = annualRent / 12;
      const vat = Math.round(amount * 0.15);
      const total = amount + vat;
      const dueDate = new Date(startDate);
      dueDate.setMonth(dueDate.getMonth() + m - 1);
      // Find the matching schedule item
      const sched = db.prepare(
        'SELECT id FROM payment_schedules WHERE contract_id = ? AND installment_no = ?'
      ).get(contractId, m);
      db.prepare(`
        INSERT OR IGNORE INTO receipts (id, tenant_id, receipt_number, contract_id, schedule_id, renter_id,
          unit_id, amount, vat_amount, total_amount, payment_date, payment_method,
          description_ar, approval_status, zatca_status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, T.TENANT_ID, receiptNum, contractId, sched?.id || null, renterIds[i], u.id,
        amount, vat, total, dueDate.toISOString().split('T')[0], 'bank_transfer',
        `إيجار - دفعة ${m} - ${contractNum}`, 'approved', m % 2 === 0 ? 'reported' : 'pending', T.USER_ID);
      // Also mark the schedule as paid
      if (sched) {
        db.prepare("UPDATE payment_schedules SET status = 'paid', paid_amount = ?, receipt_id = ? WHERE id = ?")
          .run(amount, id, sched.id);
      }
    }
  }

  // 6. Employees
  const empData = [
    { name_ar: 'محمد القرشي', role: 'مدير العقارات', basic: 8000, housing: 2000, transport: 500, prop: '', iban: 'SA0380000000608010167519' },
    { name_ar: 'علي المزيني', role: 'مشرف فندق', basic: 6000, housing: 1500, transport: 500, prop: properties[1].id, iban: 'SA0380000000608010167520' },
    { name_ar: 'عبدالله الرحيلي', role: 'حارس أمن', basic: 3500, housing: 800, transport: 300, prop: properties[0].id, iban: 'SA0380000000608010167521' },
    { name_ar: 'راشد العمري', role: 'كهربائي', basic: 4000, housing: 1000, transport: 400, prop: '', iban: 'SA0380000000608010167522' },
    { name_ar: 'فيصل الدوسري', role: 'حارس أمن', basic: 3200, housing: 800, transport: 300, prop: properties[1].id, iban: 'SA0380000000608010167523' },
  ];

  for (let i = 0; i < empData.length; i++) {
    const e = empData[i];
    db.prepare(`
      INSERT OR IGNORE INTO employees (id, tenant_id, employee_number, national_id, full_name_ar,
        job_title_ar, property_id, hire_date, basic_salary, housing_allowance,
        transport_allowance, iban, is_saudi, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(generateId(), T.TENANT_ID, `EMP-${String(i + 1).padStart(4, '0')}`,
      `10${i + 5}00000001`, e.name_ar, e.role, e.prop || null,
      '2024-01-01', e.basic, e.housing, e.transport, e.iban, 1, 'active');
  }

  // 7. Service contracts
  const services = [
    { co: 'شركة النقاء للنظافة', type: 'نظافة ومكافحة حشرات', props: 'كل العقارات', val: 48000, phone: '013-1234567' },
    { co: 'مطاعم الضيافة', type: 'إعاشة وتموين', props: 'فندق الربوة', val: 120000, phone: '013-9876543' },
    { co: 'شركة الأمن المتقدم', type: 'أمن وحراسة', props: 'برج النخيل، أبراج الواحة', val: 36000, phone: '013-5554444' },
  ];
  for (let i = 0; i < services.length; i++) {
    const s = services[i];
    db.prepare(`
      INSERT OR IGNORE INTO operational_contracts (id, tenant_id, contract_number, service_type,
        vendor_name_ar, vendor_phone, start_date, end_date, annual_value, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(generateId(), T.TENANT_ID, `SV-2026-${String(i + 1).padStart(5, '0')}`,
      s.type, s.co, s.phone, '2026-01-01', '2026-12-31', s.val,
      i < 2 ? 'active' : 'active');
  }

  // 8. Work orders
  const orders = [
    { title: 'إصلاح تسرب مياه الطابق 3', priority: 'high', date: '2026-06-05', status: 'in_progress', prop: properties[0].id },
    { title: 'صيانة دورية مكيفات الفندق', priority: 'medium', date: '2026-06-10', status: 'open', prop: properties[1].id },
    { title: 'عطل كهربائي الطابق 7', priority: 'critical', date: '2026-06-03', status: 'completed', prop: properties[0].id },
  ];
  for (let i = 0; i < orders.length; i++) {
    const o = orders[i];
    db.prepare(`
      INSERT OR IGNORE INTO work_orders (id, tenant_id, order_number, property_id, order_type,
        title_ar, priority, scheduled_date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(generateId(), T.TENANT_ID, `WO-2026-${String(i + 1).padStart(3, '0')}`,
      o.prop, o.title.includes('تسرب') ? 'corrective' : o.title.includes('دورية') ? 'preventive' : 'emergency',
      o.title, o.priority, o.date, o.status);
  }

  // 9. Utility Bills
  const utilities = [
    { type:'electricity', provider:'الشركة السعودية للكهرباء', sec_acc:'SEC-123456', sec_meter:'EL-MTR-001', consumption:2450, unit:'kWh', rate:0.18, fixed:30, amount:441, status:'paid', date:'2026-05-01', due:'2026-05-25', prop:properties[0].id },
    { type:'water', provider:'الشركة الوطنية للمياه', nwc_acc:'NWC-789012', nwc_meter:'WT-MTR-001', consumption:85, unit:'m³', rate:2.5, fixed:20, amount:212.5, status:'paid', date:'2026-05-01', due:'2026-05-25', prop:properties[0].id },
    { type:'electricity', provider:'الشركة السعودية للكهرباء', sec_acc:'SEC-345678', sec_meter:'EL-MTR-002', consumption:3800, unit:'kWh', rate:0.18, fixed:45, amount:684, status:'pending', date:'2026-05-10', due:'2026-06-05', prop:properties[1].id },
    { type:'water', provider:'الشركة الوطنية للمياه', nwc_acc:'NWC-567890', nwc_meter:'WT-MTR-002', consumption:120, unit:'m³', rate:2.5, fixed:30, amount:300, status:'pending', date:'2026-05-10', due:'2026-06-05', prop:properties[1].id },
    { type:'gas', provider:'شركة الغاز', consumption:450, unit:'m³', rate:1.2, fixed:15, amount:540, status:'pending', date:'2026-05-15', due:'2026-06-10', prop:properties[1].id },
    { type:'telecom', provider:'STC', consumption:500, unit:'GB', rate:0.1, fixed:300, amount:50, status:'overdue', date:'2026-04-01', due:'2026-04-25' },
  ];
  for (const u of utilities) {
    const id = generateId();
    const vat = Math.round(u.amount * 0.15);
    db.prepare(`
      INSERT OR IGNORE INTO utility_bills (id, tenant_id, bill_number, utility_type, property_id,
        provider_name, sec_account_number, sec_meter_number, nwc_account_number, nwc_meter_number,
        subscription_number, bill_date, due_date, consumption_amount, consumption_unit,
        unit_rate, fixed_charges, amount, vat_amount, total_amount, payment_status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, T.TENANT_ID, `UTL-2026-${String(utilities.indexOf(u) + 1).padStart(5, '0')}`,
      u.type, u.prop || null, u.provider, u.sec_acc || null, u.sec_meter || null,
      u.nwc_acc || null, u.nwc_meter || null, u.sec_acc || u.nwc_acc || null,
      u.date, u.due, u.consumption, u.unit, u.rate, u.fixed, u.amount, vat, u.amount + vat,
      u.status, T.USER_ID);
  }

  // 10. Vendors
  const vendorData = [
    { name_ar:'مؤسسة النخبة للتكييف', cr:'1010234567', vat:'300123456700003', contact:'أحمد القحطاني', phone:'0551234567', cat:'ac' },
    { name_ar:'شركة الكهرباء السعودية', cr:'1010345678', vat:'300234567800004', contact:'خدمة العملاء', phone:'920001100', cat:'general' },
    { name_ar:'أبو الجدايل للسباكة', cr:'1010456789', vat:'300345678900005', contact:'عبدالله الجدايل', phone:'0567890123', cat:'plumbing' },
    { name_ar:'مؤسسة النظافة المتكاملة', cr:'1010567890', vat:'300456789000006', contact:'خالد السلمي', phone:'0545678901', cat:'cleaning' },
    { name_ar:'العيسائي للإلكترونيات', cr:'1010678901', vat:'300567890100007', contact:'فهد العيسائي', phone:'0559012345', cat:'electronics' },
  ];
  for (const v of vendorData) {
    const id = generateId();
    const seq = vendorData.indexOf(v) + 1;
    db.prepare(`
      INSERT OR IGNORE INTO vendors (id, tenant_id, vendor_code, name_ar, cr_number, vat_number, contact_person, phone, category, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(id, T.TENANT_ID, `V-${String(seq).padStart(4, '0')}`,
      v.name_ar, v.cr, v.vat, v.contact, v.phone, v.cat);
  }

  // 11. Purchase Orders
  const poData = [
    { vendorName:'مؤسسة النخبة للتكييف', items:[{name:'مكيف سبليت 18000 وحدة', qty:5, unit_price:2200},{name:'فريون R410A', qty:10, unit_price:180}], status:'received', date:'2026-05-10', cat:'inventory' },
    { vendorName:'أبو الجدايل للسباكة', items:[{name:'أنابيب PVC 1 بوصة', qty:50, unit_price:12},{name:'خلاط ماء', qty:20, unit_price:85},{name:'طقم تسليك مجاري', qty:3, unit_price:450}], status:'confirmed', date:'2026-05-20', cat:'maintenance' },
    { vendorName:'مؤسسة النظافة المتكاملة', items:[{name:'مستلزمات نظافة متنوعة', qty:1, unit_price:3500}], status:'draft', date:'2026-05-25', cat:'cleaning' },
    { vendorName:null, items:[{name:'عمولة وسيط عقاري - عقد إيجار مكتب', qty:1, unit_price:2500}], status:'confirmed', date:'2026-05-15', cat:'commission' },
  ];
  for (const po of poData) {
    const id = generateId();
    const poSeq = poData.indexOf(po) + 1;
    const vendor = po.vendorName ? db.prepare('SELECT id FROM vendors WHERE tenant_id = ? AND name_ar = ?').get(T.TENANT_ID, po.vendorName) : null;
    const subtotal = po.items.reduce((s, i) => s + (i.qty * i.unit_price), 0);
    const vat = Math.round(subtotal * 0.15);
    const total = subtotal + vat;
    db.prepare(`
      INSERT OR IGNORE INTO purchase_orders (id, tenant_id, po_number, vendor_id, order_date, status, items, subtotal, vat_amount, total_amount, created_by, expense_category)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, T.TENANT_ID, `PO-2026-${String(poSeq).padStart(5, '0')}`,
      vendor?.id || null, po.date, po.status, JSON.stringify(po.items),
      subtotal, vat, total, T.USER_ID, po.cat);
  }

  // 12. Inventory Items
  const invData = [
    { name_ar:'فريون R410A', cat:'spare_parts', unit:'kg', stock:15, min:5, max:50 },
    { name_ar:'أنابيب PVC 1 بوصة', cat:'spare_parts', unit:'piece', stock:120, min:20, max:200 },
    { name_ar:'لمبة LED 15 واط', cat:'spare_parts', unit:'piece', stock:200, min:30, max:300 },
    { name_ar:'مستلزمات نظافة', cat:'cleaning_supplies', unit:'box', stock:8, min:3, max:20 },
    { name_ar:'قفازات عمل', cat:'tools', unit:'box', stock:3, min:10, max:30 },
    { name_ar:'مقياس ضغط فريون', cat:'tools', unit:'piece', stock:2, min:1, max:5 },
  ];
  for (const item of invData) {
    const id = generateId();
    const seq = invData.indexOf(item) + 1;
    db.prepare(`
      INSERT OR IGNORE INTO inventory_items (id, tenant_id, item_code, name_ar, category, unit_type, current_stock, min_stock, max_stock, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(id, T.TENANT_ID, `INV-${String(seq).padStart(5, '0')}`,
      item.name_ar, item.cat, item.unit, item.stock, item.min, item.max);
  }

  console.log('✅ Database seeded successfully!');
  console.log(`   - ${properties.length} properties with units`);
  console.log(`   - ${renterNames.length} renters`);
  console.log(`   - ${occupiedUnits.length} contracts with payment schedules`);
  console.log(`   - ${empData.length} employees`);
  console.log(`   - ${services.length} service contracts`);
  console.log(`   - ${orders.length} work orders`);
  console.log(`   - ${utilities.length} utility bills`);
  console.log(`   - ${vendorData.length} vendors`);
  console.log(`   - ${poData.length} purchase orders`);
  console.log(`   - ${invData.length} inventory items`);

  closeDb();
}

seed();

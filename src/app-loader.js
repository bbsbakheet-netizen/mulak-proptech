// Mulak PropTech — App Data Loader
// Loads real data from backend into the global state used by index.html

import * as API from './api.js';

// Map DB field names to the format expected by the frontend
function mapProperty(p) {
  return {
    id: p.id,
    nameAr: p.name_ar,
    nameEn: p.name_en || p.name_ar,
    type: p.property_type,
    city: p.city || '',
    district: p.district || '',
    deed: p.deed_number || '',
    floors: p.floors_count || 1,
    total: p.total_units || 0,
    occ: 0, // will be updated
    emoji: { residential: '🏗️', hotel: '🏨', commercial: '🏢', mixed: '🏬' }[p.property_type] || '🏗️',
  };
}

function mapUnit(u) {
  return {
    id: u.id,
    propId: u.property_id,
    num: u.unit_number,
    type: u.unit_type,
    floor: u.floor_number || 1,
    rent: u.base_rent || 0,
    status: u.status || 'vacant',
    tenant: '',
    waterMeter: u.water_meter_no || '',
    electricityMeter: u.electricity_meter_no || '',
    gasMeter: u.gas_meter_no || '',
  };
}

function mapContract(c) {
  const monthly = Math.round((c.annual_rent || 0) / 12);
  return {
    id: c.id,
    num: c.contract_number,
    unitId: c.unit_id,
    propId: c.property_id || '',
    tenant: c.renter_name_ar || '',
    nid: c.national_id || '',
    start: c.start_date,
    end: c.end_date,
    annual: c.annual_rent || 0,
    freq: c.installments_count || 12,
    deposit: c.security_deposit || 0,
    status: c.status || 'draft',
  };
}

function mapReceipt(r) {
  return {
    id: r.id,
    num: r.receipt_number,
    contractId: r.contract_id,
    tenant: r.renter_name || '',
    unit: r.unit_number || '',
    prop: r.property_name || '',
    amount: r.amount || 0,
    vat: r.vat_amount || 0,
    total: r.total_amount || 0,
    date: r.payment_date || r.created_at?.split('T')[0] || '',
    method: r.payment_method || 'bank_transfer',
    zatca: r.zatca_status === 'reported' ? 'reported' : 'pending',
    zatcaQr: r.zatca_qr_code || '',
    approvalStatus: r.approval_status || 'pending',
    scheduleId: r.schedule_id,
  };
}

function mapQuote(q) {
  return {
    id: q.id,
    num: q.quote_number,
    client: q.client_name_ar || '',
    type: q.quote_type || 'rental',
    phone: q.client_phone || '',
    subtotal: q.subtotal || 0,
    vat: q.vat_amount || 0,
    total: q.total_amount || 0,
    valid: q.valid_until || '',
    status: q.status || 'draft',
  };
}

function mapEmployee(e) {
  return {
    id: e.id,
    nameAr: e.full_name_ar,
    nameEn: e.full_name_en || e.full_name_ar,
    cat: e.job_title_ar?.includes('حارس') || e.job_title_ar?.includes('كهربائي') ? 'worker' : 'admin',
    role: e.job_title_ar || '',
    propId: e.property_id || 0,
    phone: e.phone || '',
    basic: e.basic_salary || 0,
    housing: e.housing_allowance || 0,
    transport: e.transport_allowance || 0,
    iban: e.iban || '',
    status: e.status || 'active',
    isSaudi: e.is_saudi === 1 || e.is_saudi === true,
  };
}

function mapService(s) {
  return {
    id: s.id,
    co: s.vendor_name_ar,
    type: s.service_type || '',
    props: s.property_name_ar || '',
    start: s.start_date || '',
    end: s.end_date || '',
    val: s.annual_value || 0,
    phone: s.vendor_phone || '',
    status: s.status || 'active',
  };
}

function mapCustomer(c) {
  return {
    id: c.id,
    type: c.customer_type || 'individual',
    name: c.customer_type === 'company' ? c.company_name_ar : c.full_name_ar,
    phone: c.phone || '',
    email: c.email || '',
    nationalId: c.national_id || '',
    companyName: c.company_name_ar || '',
    crNumber: c.cr_number || '',
    vatNumber: c.vat_number || '',
    nationalAddress: c.national_address || '',
    buildingNumber: c.building_number || '',
    street: c.street || '',
    district: c.district || '',
    city: c.city || '',
    postalCode: c.postal_code || '',
    subNumber: c.sub_number || '',
    notes: c.notes || '',
    status: c.customer_status || 'active',
  };
}

function mapWorkOrder(w) {
  return {
    id: w.id,
    num: w.order_number,
    propId: w.property_id || '',
    type: w.order_type || 'corrective',
    title: w.title_ar || '',
    priority: w.priority || 'medium',
    date: w.scheduled_date || '',
    status: w.status || 'open',
  };
}

// Try to load all data from API, fall back to existing mock data
export async function loadInitialData() {

  const online = await API.checkBackendStatus();
  addApiLog?.('BACKEND', 'GET /api/status', online ? 'Online — Real data mode' : 'Offline — Demo mode');

  // Load properties and units first
  try {
    const props = await API.fetchProperties();
    window.props = props.map(mapProperty);

    const units = await API.fetchUnits();
    window.units = units.map(mapUnit);

    // Update occupied count per property from units
    window.units.forEach(u => {
      const p = window.props.find(x => x.id === u.propId);
      if (p && u.status === 'occupied') p.occ = (p.occ || 0) + 1;
    });
  } catch (e) {
    console.warn('Could not load properties:', e.message);
  }

  // Auto-generate receipts for due payment schedules
  try {
    const result = await API.generateDueReceipts();
    if (result.generated > 0) {
      addApiLog?.('Receipts', 'Auto-Generate', `تم إنشاء ${result.generated} سند قبض آلياً`);
    }
  } catch (e) {
    console.warn('Could not generate due receipts:', e.message);
  }

  try {
    const contracts = await API.fetchContracts();
    window.contracts = contracts.map(mapContract);
  } catch (e) {
    console.warn('Could not load contracts:', e.message);
  }

  try {
    const receipts = await API.fetchReceipts({ limit: 50 });
    window.receipts = receipts.map(mapReceipt);
  } catch (e) {
    console.warn('Could not load receipts:', e.message);
  }

  try {
    const quotes = await API.fetchQuotations();
    window.quotations = quotes.map(mapQuote);
  } catch (e) {
    console.warn('Could not load quotations:', e.message);
  }

  try {
    const employees = await API.fetchEmployees();
    window.staffList = employees.map(mapEmployee);
  } catch (e) {
    console.warn('Could not load employees:', e.message);
  }

  try {
    const services = await API.fetchServiceContracts();
    window.services = services.map(mapService);
  } catch (e) {
    console.warn('Could not load services:', e.message);
  }

  try {
    const workOrders = await API.fetchWorkOrders();
    window.workOrders = workOrders.map(mapWorkOrder);
  } catch (e) {
    console.warn('Could not load work orders:', e.message);
  }

  try {
    const customers = await API.fetchCustomers();
    window.customers = customers.map(mapCustomer);
  } catch (e) {
    console.warn('Could not load customers:', e.message);
  }


  // Re-render current page if app is already initialized
  if (typeof refreshCurrentPage === 'function') {
    populateSelects();
    refreshCurrentPage();
  }
}

const FETCH_MAP = {
  props:       () => API.fetchProperties().then(d => { window.props = d.map(mapProperty); renderProperties(); }),
  units:       () => API.fetchUnits().then(d => { window.units = d.map(mapUnit); renderUnits(); }),
  contracts:   () => API.fetchContracts().then(d => { window.contracts = d.map(mapContract); renderContracts(); }),
  receipts:    () => API.fetchReceipts({ limit: 50 }).then(d => { window.receipts = d.map(mapReceipt); renderReceipts(); }),
  quotations:  () => API.fetchQuotations().then(d => { window.quotations = d.map(mapQuote); renderQuotes(); }),
  staffList:   () => API.fetchEmployees().then(d => { window.staffList = d.map(mapEmployee); renderStaff(); }),
  services:    () => API.fetchServiceContracts().then(d => { window.services = d.map(mapService); renderServices(); }),
  workOrders:  () => API.fetchWorkOrders().then(d => { window.workOrders = d.map(mapWorkOrder); renderWOs(); }),
  customers:   () => API.fetchCustomers().then(d => { window.customers = d.map(mapCustomer); renderCustomers(); }),
};

async function refreshTypes(types) {
  const promises = types.map(t => {
    const fn = FETCH_MAP[t];
    if (fn) return fn().catch(e => console.warn(`Could not load ${t}:`, e.message));
  });
  await Promise.allSettled(promises);
  refreshCurrentPage();
}

// ─── Override save operations to use API ──────

const originalAddProp = window.addProp;
window.addProp = async function () {
  const nameAr = document.getElementById('np-name-ar').value.trim();
  if (!nameAr) { alert(window.lang === 'ar' ? 'يرجى إدخال اسم العقار' : 'Please enter property name'); return; }

  if (API.getOnlineStatus()) {
    try {
      const data = {
        name_ar: nameAr,
        name_en: document.getElementById('np-name-en').value || nameAr,
        property_type: document.getElementById('np-type').value,
        city: document.getElementById('np-city').value || 'ينبع',
        district: document.getElementById('np-district').value,
        deed_number: document.getElementById('np-deed').value,
        floors_count: +document.getElementById('np-floors').value || 1,
        total_units: +document.getElementById('np-total').value || 1,
        notes: document.getElementById('np-notes').value,
      };
      const result = await API.createProperty(data);
      await refreshTypes(['props', 'units']);
      closeM('m-prop');
      renderProperties();
      populateSelects();
      alert(`✓ ${window.lang === 'ar' ? `تم إضافة العقار وتوليد ${result.unitsGenerated} وحدة تلقائياً` : `Property added with ${result.unitsGenerated} auto-generated units`}`);
      return;
    } catch (e) {
      console.error('Failed to create property:', e);
    }
  }
  // Fallback to original function
  if (originalAddProp) originalAddProp();
};

const originalAddUnit = window.addUnit;
window.addUnit = async function () {
  const num = document.getElementById('nu-num').value.trim();
  if (!num) return;

  if (API.getOnlineStatus()) {
    try {
      await API.createUnit({
        property_id: document.getElementById('nu-prop').value,
        unit_number: num,
        unit_type: document.getElementById('nu-type').value,
        floor_number: +document.getElementById('nu-floor').value || 1,
        area_sqm: +document.getElementById('nu-area').value || null,
        base_rent: +document.getElementById('nu-rent').value || 0,
        status: document.getElementById('nu-status').value,
        water_meter_no: document.getElementById('nu-meter-water').value || null,
        electricity_meter_no: document.getElementById('nu-meter-el').value || null,
        gas_meter_no: document.getElementById('nu-meter-gas').value || null,
      });
      await refreshTypes(['units', 'props']);
      closeM('m-unit');
      renderUnits();
      return;
    } catch (e) {
      console.error('Failed to create unit:', e);
    }
  }
  if (originalAddUnit) originalAddUnit();
};

const originalSaveContract = window.saveContract;
window.saveContract = async function () {
  if (!window.cNafathVerified) {
    alert(window.lang === 'ar' ? 'يرجى التحقق من هوية مالك العقار عبر النفاذ الوطني أولاً' : 'Please verify the property owner identity via Nafath first');
    return;
  }

  const tenantName = document.getElementById('c-tenant').value;
  if (!tenantName) {
    alert(window.lang === 'ar' ? 'يرجى إدخال اسم المستأجر' : 'Please enter tenant name');
    return;
  }

  if (API.getOnlineStatus()) {
    try {
      const contractData = {
        unit_id: document.getElementById('c-unit').value,
        renter: {
          national_id: document.getElementById('c-nid').value,
          full_name_ar: tenantName,
          phone: document.getElementById('c-phone').value,
          email: document.getElementById('c-email').value,
        },
        start_date: document.getElementById('c-start').value,
        end_date: document.getElementById('c-end').value,
        annual_rent: +document.getElementById('c-annual').value || 0,
        security_deposit: +document.getElementById('c-deposit').value || 0,
        payment_frequency: document.getElementById('c-freq').value === '12' ? 'monthly'
          : document.getElementById('c-freq').value === '4' ? 'quarterly'
          : document.getElementById('c-freq').value === '2' ? 'semi_annual' : 'annual',
        installments_count: +document.getElementById('c-freq').value || 12,
        grace_days: +document.getElementById('c-grace').value || 5,
        special_conditions: document.getElementById('c-special').value,
      };

      // Create contract then activate (generates schedule + receipts)
      const contract = await API.createContract(contractData);
      await API.activateContract(contract.id);

      await refreshTypes(['contracts', 'units', 'receipts']);
      closeM('m-contract');

      const freq = +document.getElementById('c-freq').value || 12;
      alert(`✓ ${window.lang === 'ar' ? `تم إنشاء العقد ${contract.contract_number} وتوليد ${freq} سندات قبض تلقائياً` : `Contract ${contract.contract_number} created with ${freq} auto-generated receipts`}`);

      renderContracts();
      return;
    } catch (e) {
      console.error('Failed to create contract:', e);
      alert(`Error: ${e.message}`);
    }
  }
  if (originalSaveContract) originalSaveContract();
};

const originalSaveQuote = window.saveQuote;
window.saveQuote = async function () {
  const client = document.getElementById('q-client').value;
  if (!client) {
    alert(window.lang === 'ar' ? 'يرجى إدخال اسم العميل' : 'Please enter client name');
    return;
  }

  if (API.getOnlineStatus()) {
    try {
      const items = [];
      for (let i = 1; i <= window.quoteItemCount; i++) {
        const desc = document.getElementById(`qi-desc-${i}`);
        const qty = document.getElementById(`qi-qty-${i}`);
        const price = document.getElementById(`qi-price-${i}`);
        if (desc && qty && price) {
          items.push({
            desc: desc.value || 'خدمة',
            qty: +qty.value || 1,
            unit_price: +price.value || 0,
          });
        }
      }

      await API.createQuotation({
        client_name_ar: client,
        client_phone: document.getElementById('q-phone').value,
        quote_type: document.getElementById('q-type').value,
        valid_until: document.getElementById('q-valid').value,
        unit_id: document.getElementById('q-unit').value || null,
        items,
      });

      await refreshTypes(['quotations']);
      closeM('m-quote');
      renderQuotes();
      return;
    } catch (e) {
      console.error('Failed to create quotation:', e);
    }
  }
  if (originalSaveQuote) originalSaveQuote();
};

const originalAcceptQuote = window.acceptQuote;
window.acceptQuote = async function (id) {
  if (API.getOnlineStatus()) {
    try {
      await API.acceptQuotation(id);
      await refreshTypes(['quotations']);
      renderQuotes();
      return;
    } catch (e) {
      console.error('Failed to accept quote:', e);
    }
  }
  if (originalAcceptQuote) originalAcceptQuote(id);
};

const originalAddStaff = window.addStaff;
window.addStaff = async function () {
  const nameAr = document.getElementById('ns-name-ar').value.trim();
  if (!nameAr) return;

  if (API.getOnlineStatus()) {
    try {
      await API.createEmployee({
        full_name_ar: nameAr,
        full_name_en: document.getElementById('ns-name-en').value || nameAr,
        job_title_ar: document.getElementById('ns-role').value,
        property_id: document.getElementById('ns-prop').value || null,
        phone: document.getElementById('ns-phone').value,
        basic_salary: +document.getElementById('ns-basic').value || 0,
        housing_allowance: +document.getElementById('ns-housing').value || 0,
        transport_allowance: +document.getElementById('ns-transport').value || 0,
        iban: document.getElementById('ns-iban').value,
        hire_date: new Date().toISOString().split('T')[0],
        national_id: '1000000000',
      });
      await refreshTypes(['staffList']);
      closeM('m-staff');
      renderStaff();
      return;
    } catch (e) {
      console.error('Failed to create employee:', e);
    }
  }
  if (originalAddStaff) originalAddStaff();
};

const originalAddService = window.addService;
window.addService = async function () {
  const co = document.getElementById('sv-co').value.trim();
  if (!co) return;

  if (API.getOnlineStatus()) {
    try {
      await API.createServiceContract({
        vendor_name_ar: co,
        service_type: document.getElementById('sv-type').value,
        start_date: document.getElementById('sv-start').value,
        end_date: document.getElementById('sv-end').value,
        annual_value: +document.getElementById('sv-val').value || 0,
        vendor_phone: document.getElementById('sv-phone').value,
      });
      await refreshTypes(['services']);
      closeM('m-service');
      renderServices();
      return;
    } catch (e) {
      console.error('Failed to create service contract:', e);
    }
  }
  if (originalAddService) originalAddService();
};

const originalAddWO = window.addWO;
window.addWO = async function () {
  const title = document.getElementById('wo-title').value.trim();
  if (!title) return;

  if (API.getOnlineStatus()) {
    try {
      await API.createWorkOrder({
        property_id: document.getElementById('wo-prop').value || null,
        order_type: document.getElementById('wo-type').value,
        title_ar: title,
        priority: document.getElementById('wo-priority').value,
        scheduled_date: document.getElementById('wo-date').value,
      });
      await refreshTypes(['workOrders']);
      closeM('m-wo');
      renderWOs();
      return;
    } catch (e) {
      console.error('Failed to create work order:', e);
    }
  }
  if (originalAddWO) originalAddWO();
};

const originalRunPayroll = window.runPayroll;
window.runPayroll = async function () {
  if (API.getOnlineStatus()) {
    try {
      const month = document.getElementById('payroll-month')?.value || new Date().toISOString().slice(0, 7);
      const result = await API.runPayroll(month);
      await refreshTypes(['staffList']);
      renderPayroll();
      alert(`✓ ${window.lang === 'ar' ? `تم احتساب مسير رواتب ${month}` : `Payroll for ${month} calculated`}`);
      return;
    } catch (e) {
      console.error('Failed to run payroll:', e);
    }
  }
  if (originalRunPayroll) originalRunPayroll();
};



// Initialize: load data when the app enters
const originalInitApp = window.initApp;
window.initApp = async function () {
  await loadInitialData();
  if (originalInitApp) originalInitApp();
};

const originalSkipToApp = window.skipToApp;
window.skipToApp = async function () {
  document.getElementById('register-page').classList.add('hidden');
  document.getElementById('main-app').style.display = 'flex';
  await loadInitialData();
  if (originalInitApp) originalInitApp();
};

const originalEnterApp = window.enterApp;
window.enterApp = async function () {
  document.getElementById('register-page').classList.add('hidden');
  document.getElementById('main-app').style.display = 'flex';
  updateUserInfo();
  await loadInitialData();
  if (originalInitApp) originalInitApp();
};

// Auto-start data loading after window load
window.addEventListener('load', async () => {
  // Keep existing status check but also load initial data
  const online = await API.checkBackendStatus();
  console.log(online ? '✅ Backend connected' : '⚠️ Backend offline — Demo mode');

  // If user is already in app (skipToApp was called), load data
  const mainApp = document.getElementById('main-app');
  if (mainApp?.style.display === 'flex') {
    await loadInitialData();
    if (typeof initApp === 'function') initApp();
  }
});

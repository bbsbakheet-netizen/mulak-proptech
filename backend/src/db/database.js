import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'mullak.db');

let db;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      cr_number TEXT,
      vat_number TEXT UNIQUE,
      phone TEXT,
      email TEXT,
      city TEXT DEFAULT 'ينبع',
      country TEXT DEFAULT 'SA',
      subscription_plan TEXT DEFAULT 'starter',
      is_active INTEGER DEFAULT 1,
      settings TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      national_id TEXT,
      full_name_ar TEXT NOT NULL,
      full_name_en TEXT,
      email TEXT,
      password_hash TEXT,
      phone TEXT,
      role TEXT DEFAULT 'staff',
      is_active INTEGER DEFAULT 1,
      last_login TEXT,
      reset_token TEXT,
      reset_expires TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS branches (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name_ar TEXT NOT NULL,
      name_en TEXT,
      code TEXT,
      city TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      is_hq INTEGER DEFAULT 0,
      manager_id TEXT REFERENCES users(id),
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name_ar TEXT NOT NULL,
      name_en TEXT,
      description TEXT,
      permissions TEXT DEFAULT '[]',
      is_system INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      branch_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(tenant_id, user_id, role_id, branch_id)
    );

    CREATE TABLE IF NOT EXISTS permissions_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT,
      user_id TEXT,
      action TEXT NOT NULL,
      resource TEXT,
      granted INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS properties (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      code TEXT,
      name_ar TEXT NOT NULL,
      name_en TEXT,
      property_type TEXT NOT NULL DEFAULT 'residential',
      deed_number TEXT,
      parcel_number TEXT,
      city TEXT,
      district TEXT,
      address_ar TEXT,
      address_en TEXT,
      lat REAL,
      lng REAL,
      floors_count INTEGER DEFAULT 1,
      total_units INTEGER DEFAULT 0,
      total_area_sqm REAL,
      year_built INTEGER,
      status TEXT DEFAULT 'active',
      notes TEXT,
      meta TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS units (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      unit_number TEXT NOT NULL,
      unit_type TEXT NOT NULL DEFAULT 'apartment',
      floor_number INTEGER,
      area_sqm REAL,
      bedrooms INTEGER DEFAULT 0,
      bathrooms INTEGER DEFAULT 0,
      base_rent REAL DEFAULT 0,
      status TEXT DEFAULT 'vacant',
      features TEXT DEFAULT '[]',
      images TEXT DEFAULT '[]',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE (property_id, unit_number)
    );

    CREATE TABLE IF NOT EXISTS renters (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      national_id TEXT NOT NULL,
      id_type TEXT DEFAULT 'national',
      full_name_ar TEXT NOT NULL,
      full_name_en TEXT,
      nafath_verified INTEGER DEFAULT 0,
      nafath_verified_at TEXT,
      phone TEXT,
      email TEXT,
      nationality TEXT DEFAULT 'SA',
      employer TEXT,
      monthly_income REAL,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rental_contracts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      contract_number TEXT UNIQUE NOT NULL,
      unit_id TEXT NOT NULL REFERENCES units(id),
      renter_id TEXT NOT NULL REFERENCES renters(id),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      annual_rent REAL NOT NULL,
      monthly_rent REAL GENERATED ALWAYS AS (annual_rent / 12) STORED,
      security_deposit REAL DEFAULT 0,
      payment_frequency TEXT DEFAULT 'monthly',
      installments_count INTEGER DEFAULT 12,
      grace_days INTEGER DEFAULT 5,
      ijar_contract_id TEXT,
      ijar_status TEXT DEFAULT 'pending',
      najiz_contract_id TEXT,
      najiz_status TEXT DEFAULT 'pending',
      status TEXT DEFAULT 'draft',
      termination_reason TEXT,
      terminated_at TEXT,
      notes TEXT,
      special_conditions TEXT,
      pdf_url TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS owners (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      full_name_ar TEXT NOT NULL,
      full_name_en TEXT,
      national_id TEXT,
      id_type TEXT DEFAULT 'national',
      phone TEXT,
      email TEXT,
      bank_name TEXT,
      bank_iban TEXT,
      bank_account_no TEXT,
      address TEXT,
      city TEXT DEFAULT 'ينبع',
      nationality TEXT DEFAULT 'SA',
      ownership_pct REAL DEFAULT 100,
      management_fee_pct REAL DEFAULT 0,
      contract_terms TEXT,
      notes TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS property_ownership (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
      ownership_pct REAL DEFAULT 100,
      management_fee_pct REAL DEFAULT 0,
      is_primary INTEGER DEFAULT 0,
      start_date TEXT,
      end_date TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE (property_id, owner_id)
    );

    CREATE TABLE IF NOT EXISTS owner_settlements (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
      settlement_period TEXT NOT NULL,
      gross_rent REAL DEFAULT 0,
      management_fee REAL DEFAULT 0,
      maintenance_cost REAL DEFAULT 0,
      other_deductions REAL DEFAULT 0,
      net_amount REAL DEFAULT 0,
      transfer_status TEXT DEFAULT 'pending',
      transfer_date TEXT,
      bank_reference TEXT,
      notes TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- ═══════════════════════════════════════════════
    -- ACCOUNTING MODULE (Double-Entry)
    -- ═══════════════════════════════════════════════

    CREATE TABLE IF NOT EXISTS chart_of_accounts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      account_code TEXT NOT NULL,
      account_name_ar TEXT NOT NULL,
      account_name_en TEXT,
      account_type TEXT NOT NULL CHECK(account_type IN ('asset','liability','equity','income','expense')),
      parent_id TEXT REFERENCES chart_of_accounts(id),
      is_active INTEGER DEFAULT 1,
      is_system INTEGER DEFAULT 0,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE (tenant_id, account_code)
    );

    CREATE TABLE IF NOT EXISTS journal_entries (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      entry_number TEXT UNIQUE NOT NULL,
      entry_date TEXT NOT NULL DEFAULT (date('now')),
      reference_type TEXT,
      reference_id TEXT,
      description_ar TEXT,
      description_en TEXT,
      total_debit REAL NOT NULL DEFAULT 0,
      total_credit REAL NOT NULL DEFAULT 0,
      is_posted INTEGER DEFAULT 0,
      posted_at TEXT,
      posted_by TEXT REFERENCES users(id),
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS journal_lines (
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
      account_id TEXT NOT NULL REFERENCES chart_of_accounts(id),
      description TEXT,
      debit REAL DEFAULT 0,
      credit REAL DEFAULT 0,
      cost_center_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS account_balances (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      account_id TEXT NOT NULL REFERENCES chart_of_accounts(id),
      fiscal_year INTEGER NOT NULL,
      period INTEGER NOT NULL,
      opening_balance REAL DEFAULT 0,
      debit_total REAL DEFAULT 0,
      credit_total REAL DEFAULT 0,
      closing_balance REAL GENERATED ALWAYS AS (opening_balance + debit_total - credit_total) STORED,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE (tenant_id, account_id, fiscal_year, period)
    );

    CREATE TABLE IF NOT EXISTS trust_accounts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
      account_id TEXT NOT NULL REFERENCES chart_of_accounts(id),
      balance REAL DEFAULT 0,
      last_transaction_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- ═══════════════════════════════════════════════
    -- DEALS PIPELINE (Brokerage & Leasing)
    -- ═══════════════════════════════════════════════

    CREATE TABLE IF NOT EXISTS deals (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      deal_number TEXT UNIQUE NOT NULL,
      deal_type TEXT NOT NULL CHECK(deal_type IN ('sale','rent','management','other')),
      lead_source TEXT DEFAULT 'direct',
      stage TEXT NOT NULL DEFAULT 'lead' CHECK(stage IN ('lead','inquiry','viewing','negotiation','offer','signed','lost','cancelled')),
      property_id TEXT REFERENCES properties(id),
      unit_id TEXT REFERENCES units(id),
      client_id TEXT REFERENCES renters(id),
      agent_id TEXT REFERENCES users(id),
      client_name TEXT,
      client_phone TEXT,
      client_email TEXT,
      expected_value REAL DEFAULT 0,
      commission_value REAL DEFAULT 0,
      commission_pct REAL DEFAULT 0,
      probability INTEGER DEFAULT 10,
      expected_close_date TEXT,
      closed_date TEXT,
      status_reason TEXT,
      notes TEXT,
      assigned_to TEXT REFERENCES users(id),
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS deal_activities (
      id TEXT PRIMARY KEY,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      activity_type TEXT NOT NULL CHECK(activity_type IN ('call','visit','email','meeting','note','follow_up','other')),
      description TEXT NOT NULL,
      activity_date TEXT NOT NULL DEFAULT (date('now')),
      is_completed INTEGER DEFAULT 0,
      completed_at TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS commissions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      deal_id TEXT REFERENCES deals(id),
      contract_id TEXT REFERENCES rental_contracts(id),
      agent_id TEXT NOT NULL REFERENCES users(id),
      commission_type TEXT NOT NULL DEFAULT 'sale' CHECK(commission_type IN ('sale','rent','management','referral')),
      calculation_method TEXT DEFAULT 'fixed' CHECK(calculation_method IN ('fixed','percentage','tiered','collection_based')),
      base_amount REAL DEFAULT 0,
      rate REAL DEFAULT 0,
      calculated_amount REAL DEFAULT 0,
      paid_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','paid','cancelled')),
      due_date TEXT,
      paid_date TEXT,
      payment_ref TEXT,
      notes TEXT,
      approved_by TEXT REFERENCES users(id),
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS maintenance_categories (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name_ar TEXT NOT NULL,
      name_en TEXT,
      icon TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS maintenance_tickets (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      ticket_number TEXT UNIQUE NOT NULL,
      property_id TEXT REFERENCES properties(id),
      unit_id TEXT REFERENCES units(id),
      title TEXT NOT NULL,
      description TEXT,
      category_id TEXT REFERENCES maintenance_categories(id),
      priority TEXT DEFAULT 'medium' CHECK(priority IN ('low','medium','high','urgent')),
      status TEXT DEFAULT 'open' CHECK(status IN ('open','assigned','in_progress','completed','cancelled')),
      reported_by TEXT REFERENCES users(id),
      reported_by_name TEXT,
      reported_by_phone TEXT,
      assigned_to TEXT REFERENCES users(id),
      owner_id TEXT REFERENCES owners(id),
      estimated_cost REAL DEFAULT 0,
      actual_cost REAL DEFAULT 0,
      cost_bearer TEXT DEFAULT 'owner' CHECK(cost_bearer IN ('owner','company','tenant')),
      scheduled_date TEXT,
      completed_date TEXT,
      resolution_notes TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS maintenance_activities (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      ticket_id TEXT NOT NULL REFERENCES maintenance_tickets(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      activity_type TEXT DEFAULT 'note' CHECK(activity_type IN ('note','status_change','assignment','payment','completion')),
      old_value TEXT,
      new_value TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS marketing_channels (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name_ar TEXT NOT NULL,
      name_en TEXT,
      channel_type TEXT DEFAULT 'website' CHECK(channel_type IN ('website','social','portal','print','other')),
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS marketing_listings (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      listing_number TEXT UNIQUE NOT NULL,
      property_id TEXT REFERENCES properties(id),
      unit_id TEXT REFERENCES units(id),
      listing_type TEXT NOT NULL CHECK(listing_type IN ('sale','rent','both')),
      title_ar TEXT NOT NULL,
      title_en TEXT,
      description_ar TEXT,
      description_en TEXT,
      price REAL DEFAULT 0,
      price_negotiable INTEGER DEFAULT 1,
      currency TEXT DEFAULT 'SAR',
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft','published','pending','rented','sold','expired','archived')),
      featured INTEGER DEFAULT 0,
      channels TEXT DEFAULT '[]',
      media_count INTEGER DEFAULT 0,
      view_count INTEGER DEFAULT 0,
      inquiry_count INTEGER DEFAULT 0,
      published_at TEXT,
      expires_at TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS marketing_media (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      listing_id TEXT NOT NULL REFERENCES marketing_listings(id) ON DELETE CASCADE,
      media_type TEXT DEFAULT 'image' CHECK(media_type IN ('image','video','document','virtual_tour')),
      url TEXT NOT NULL,
      thumb_url TEXT,
      alt_text TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS marketing_inquiries (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      listing_id TEXT NOT NULL REFERENCES marketing_listings(id) ON DELETE CASCADE,
      inquirer_name TEXT NOT NULL,
      inquirer_phone TEXT,
      inquirer_email TEXT,
      message TEXT,
      status TEXT DEFAULT 'new' CHECK(status IN ('new','contacted','qualified','converted','closed')),
      assigned_to TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payment_schedules (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      contract_id TEXT NOT NULL REFERENCES rental_contracts(id) ON DELETE CASCADE,
      installment_no INTEGER NOT NULL,
      due_date TEXT NOT NULL,
      amount REAL NOT NULL,
      vat_amount REAL GENERATED ALWAYS AS (amount * 0.15) STORED,
      total_amount REAL GENERATED ALWAYS AS (amount * 1.15) STORED,
      status TEXT DEFAULT 'pending',
      paid_amount REAL DEFAULT 0,
      paid_date TEXT,
      payment_method TEXT,
      reference_no TEXT,
      receipt_id TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS receipts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      receipt_number TEXT UNIQUE NOT NULL,
      contract_id TEXT REFERENCES rental_contracts(id),
      schedule_id TEXT REFERENCES payment_schedules(id),
      renter_id TEXT REFERENCES renters(id),
      unit_id TEXT REFERENCES units(id),
      amount REAL NOT NULL,
      vat_amount REAL DEFAULT 0,
      total_amount REAL NOT NULL,
      payment_date TEXT NOT NULL DEFAULT (date('now')),
      payment_method TEXT NOT NULL,
      reference_no TEXT,
      description_ar TEXT,
      description_en TEXT,
      zatca_uuid TEXT,
      zatca_invoice_hash TEXT,
      zatca_qr_code TEXT,
      zatca_status TEXT DEFAULT 'pending',
      zatca_submitted_at TEXT,
      approval_status TEXT DEFAULT 'pending',
      approved_at TEXT,
      approved_by TEXT REFERENCES users(id),
      is_cancelled INTEGER DEFAULT 0,
      cancelled_at TEXT,
      cancel_reason TEXT,
      pdf_url TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      invoice_number TEXT UNIQUE NOT NULL,
      invoice_type TEXT DEFAULT 'standard',
      reference_id TEXT,
      reference_type TEXT,
      buyer_name_ar TEXT,
      buyer_name_en TEXT,
      buyer_vat TEXT,
      buyer_cr TEXT,
      buyer_address TEXT,
      subtotal REAL NOT NULL,
      discount_amount REAL DEFAULT 0,
      vat_rate REAL DEFAULT 15.00,
      vat_amount REAL NOT NULL,
      rett_amount REAL DEFAULT 0,
      total_amount REAL NOT NULL,
      zatca_uuid TEXT,
      zatca_invoice_hash TEXT,
      zatca_qr_code TEXT,
      zatca_xml TEXT,
      zatca_status TEXT DEFAULT 'pending',
      zatca_response TEXT,
      issue_date TEXT NOT NULL DEFAULT (date('now')),
      supply_date TEXT,
      due_date TEXT,
      paid_at TEXT,
      status TEXT DEFAULT 'issued',
      notes TEXT,
      pdf_url TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS zatca_settings (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      environment TEXT DEFAULT 'sandbox' CHECK(environment IN ('sandbox','production')),
      organization_name TEXT,
      vat_number TEXT,
      cr_number TEXT,
      building_number TEXT,
      street TEXT,
      district TEXT,
      city TEXT,
      postal_code TEXT,
      country_code TEXT DEFAULT 'SA',
      additional_number TEXT,
      otp TEXT,
      compliance_request_id TEXT,
      production_csid TEXT,
      production_csid_expiry TEXT,
      signature_cert TEXT,
      signature_private_key TEXT,
      encryption_cert TEXT,
      encryption_private_key TEXT,
      pih TEXT,
      is_compliant INTEGER DEFAULT 0,
      last_sync_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS zatca_invoice_queue (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      receipt_id TEXT REFERENCES receipts(id),
      invoice_id TEXT REFERENCES invoices(id),
      invoice_number TEXT NOT NULL,
      invoice_type TEXT DEFAULT 'standard' CHECK(invoice_type IN ('standard','simplified','debit','credit')),
      invoice_uuid TEXT,
      invoice_hash TEXT,
      qr_code TEXT,
      xml_content TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','submitted','cleared','reported','rejected','failed')),
      zatca_response TEXT,
      zatca_status_code TEXT,
      zatca_warnings TEXT,
      submitted_at TEXT,
      cleared_at TEXT,
      reported_at TEXT,
      error_message TEXT,
      retry_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quotations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      quote_number TEXT UNIQUE NOT NULL,
      quote_type TEXT DEFAULT 'rental',
      client_name_ar TEXT NOT NULL,
      client_name_en TEXT,
      client_phone TEXT,
      client_email TEXT,
      client_cr TEXT,
      property_id TEXT REFERENCES properties(id),
      unit_id TEXT REFERENCES units(id),
      items TEXT NOT NULL DEFAULT '[]',
      subtotal REAL DEFAULT 0,
      vat_amount REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      discount_pct REAL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      valid_until TEXT,
      notes_ar TEXT,
      notes_en TEXT,
      terms_ar TEXT,
      terms_en TEXT,
      status TEXT DEFAULT 'draft',
      accepted_at TEXT,
      converted_to TEXT REFERENCES rental_contracts(id),
      pdf_url TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS operational_contracts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      contract_number TEXT UNIQUE NOT NULL,
      property_id TEXT REFERENCES properties(id),
      service_type TEXT NOT NULL,
      vendor_name_ar TEXT NOT NULL,
      vendor_name_en TEXT,
      vendor_cr TEXT,
      vendor_vat TEXT,
      vendor_phone TEXT,
      vendor_email TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      annual_value REAL NOT NULL,
      payment_frequency TEXT DEFAULT 'monthly',
      scope_of_work_ar TEXT,
      scope_of_work_en TEXT,
      sla_response_hours INTEGER DEFAULT 24,
      status TEXT DEFAULT 'active',
      auto_renew INTEGER DEFAULT 0,
      renewal_notice_days INTEGER DEFAULT 30,
      cost_center TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS work_orders (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      order_number TEXT UNIQUE NOT NULL,
      property_id TEXT REFERENCES properties(id),
      unit_id TEXT REFERENCES units(id),
      op_contract_id TEXT REFERENCES operational_contracts(id),
      order_type TEXT DEFAULT 'corrective',
      service_type TEXT,
      title_ar TEXT NOT NULL,
      title_en TEXT,
      description TEXT,
      priority TEXT DEFAULT 'medium',
      scheduled_date TEXT,
      completed_date TEXT,
      assigned_to TEXT REFERENCES users(id),
      estimated_cost REAL,
      actual_cost REAL,
      status TEXT DEFAULT 'open',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      employee_number TEXT UNIQUE NOT NULL,
      national_id TEXT NOT NULL,
      id_type TEXT DEFAULT 'national',
      full_name_ar TEXT NOT NULL,
      full_name_en TEXT,
      job_title_ar TEXT,
      job_title_en TEXT,
      department TEXT,
      property_id TEXT REFERENCES properties(id),
      hire_date TEXT NOT NULL,
      termination_date TEXT,
      basic_salary REAL NOT NULL,
      housing_allowance REAL DEFAULT 0,
      transport_allowance REAL DEFAULT 0,
      other_allowances REAL DEFAULT 0,
      bank_name TEXT,
      iban TEXT,
      gosi_number TEXT,
      nationality TEXT DEFAULT 'SA',
      is_saudi INTEGER DEFAULT 1,
      commission_type TEXT DEFAULT 'none',
      commission_rate REAL DEFAULT 0,
      phone TEXT,
      email TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payroll_runs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      payroll_month TEXT NOT NULL,
      run_date TEXT NOT NULL DEFAULT (date('now')),
      total_employees INTEGER DEFAULT 0,
      total_basic REAL DEFAULT 0,
      total_allowances REAL DEFAULT 0,
      total_deductions REAL DEFAULT 0,
      total_commissions REAL DEFAULT 0,
      total_net REAL DEFAULT 0,
      wps_file_ref TEXT,
      wps_status TEXT DEFAULT 'pending',
      status TEXT DEFAULT 'draft',
      notes TEXT,
      approved_by TEXT REFERENCES users(id),
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payroll_lines (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      payroll_run_id TEXT NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
      employee_id TEXT NOT NULL REFERENCES employees(id),
      basic_salary REAL NOT NULL,
      housing_allowance REAL DEFAULT 0,
      transport_allowance REAL DEFAULT 0,
      other_allowances REAL DEFAULT 0,
      overtime_amount REAL DEFAULT 0,
      commission_amount REAL DEFAULT 0,
      gosi_employee REAL DEFAULT 0,
      gosi_employer REAL DEFAULT 0,
      other_deductions REAL DEFAULT 0,
      net_salary REAL NOT NULL,
      payment_status TEXT DEFAULT 'pending',
      bank_ref TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tax_records (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      record_type TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      reference_type TEXT NOT NULL,
      tax_period TEXT,
      taxable_amount REAL NOT NULL,
      tax_rate REAL NOT NULL,
      tax_amount REAL NOT NULL,
      zatca_reference TEXT,
      status TEXT DEFAULT 'pending',
      filed_at TEXT,
      due_date TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT,
      user_id TEXT,
      action TEXT NOT NULL,
      table_name TEXT,
      record_id TEXT,
      old_data TEXT,
      new_data TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_properties_tenant ON properties(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_units_tenant ON units(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_units_property ON units(property_id);
    CREATE INDEX IF NOT EXISTS idx_units_status ON units(status);
    CREATE INDEX IF NOT EXISTS idx_contracts_tenant ON rental_contracts(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_contracts_unit ON rental_contracts(unit_id);
    CREATE INDEX IF NOT EXISTS idx_contracts_renter ON rental_contracts(renter_id);
    CREATE INDEX IF NOT EXISTS idx_contracts_status ON rental_contracts(status);
    CREATE INDEX IF NOT EXISTS idx_schedules_contract ON payment_schedules(contract_id);
    CREATE INDEX IF NOT EXISTS idx_schedules_due_date ON payment_schedules(due_date);
    CREATE INDEX IF NOT EXISTS idx_receipts_tenant ON receipts(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_receipts_contract ON receipts(contract_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_quotations_tenant ON quotations(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_employees_tenant ON employees(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_payroll_lines_run ON payroll_lines(payroll_run_id);
    CREATE INDEX IF NOT EXISTS idx_payroll_lines_employee ON payroll_lines(employee_id);
    CREATE INDEX IF NOT EXISTS idx_op_contracts_tenant ON operational_contracts(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_work_orders_tenant ON work_orders(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_log(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

    -- Utility Bills (Water, Electricity, Gas, etc.)
    CREATE TABLE IF NOT EXISTS utility_bills (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      bill_number TEXT UNIQUE NOT NULL,
      utility_type TEXT NOT NULL,        -- water | electricity | gas | telecom | internet
      property_id TEXT REFERENCES properties(id),
      unit_id TEXT REFERENCES units(id),
      provider_name TEXT NOT NULL,
      -- الحكومة: الحساب الموحد للخدمات البلدية
      gov_service_id TEXT,              -- Fatora / منصة فاتورة للخدمات البلدية
      -- كهرباء: هيئة تنظيم الكهرباء (SEC / Saudi Electricity Company)
      sec_account_number TEXT,          -- رقم حساب المشترك في الشركة السعودية للكهرباء
      sec_meter_number TEXT,            -- رقم العداد الكهربائي
      sec_branch_code TEXT,             -- رمز الفرع
      -- ماء: الشركة الوطنية للمياه (NWC)
      nwc_account_number TEXT,          -- رقم حساب المشترك في الشركة الوطنية للمياه
      nwc_meter_number TEXT,            -- رقم عداد المياه
      nwc_branch_code TEXT,             -- رمز الفرع
      -- بيانات الاشتراك
      subscription_number TEXT,
      bill_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      consumption_amount REAL DEFAULT 0, -- kWh, m³, etc.
      consumption_unit TEXT DEFAULT 'kWh',
      unit_rate REAL DEFAULT 0,
      fixed_charges REAL DEFAULT 0,
      amount REAL NOT NULL,
      vat_amount REAL DEFAULT 0,
      total_amount REAL NOT NULL,
      payment_status TEXT DEFAULT 'pending', -- pending | paid | overdue | disputed
      payment_date TEXT,
      payment_method TEXT,
      reference_no TEXT,
      notes TEXT,
      receipt_image TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_utility_tenant ON utility_bills(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_utility_property ON utility_bills(property_id);
    CREATE INDEX IF NOT EXISTS idx_utility_type ON utility_bills(utility_type);
    CREATE INDEX IF NOT EXISTS idx_utility_status ON utility_bills(payment_status);

    -- Vendors / Suppliers
    CREATE TABLE IF NOT EXISTS vendors (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      vendor_code TEXT UNIQUE NOT NULL,
      name_ar TEXT NOT NULL,
      name_en TEXT,
      cr_number TEXT,
      vat_number TEXT,
      contact_person TEXT,
      phone TEXT,
      email TEXT,
      website TEXT,
      address TEXT,
      category TEXT DEFAULT 'general',   -- general | electrical | plumbing | ac | cleaning | security | catering
      payment_terms TEXT DEFAULT 'net_30',
      bank_name TEXT,
      iban TEXT,
      is_active INTEGER DEFAULT 1,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_vendors_tenant ON vendors(tenant_id);

    -- Purchase Orders
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      po_number TEXT UNIQUE NOT NULL,
      vendor_id TEXT NOT NULL REFERENCES vendors(id),
      property_id TEXT REFERENCES properties(id),
      order_date TEXT NOT NULL DEFAULT (date('now')),
      expected_date TEXT,
      delivery_date TEXT,
      status TEXT DEFAULT 'draft',      -- draft | sent | confirmed | received | partially_received | cancelled
      items TEXT NOT NULL DEFAULT '[]', -- JSON array: [{name, desc, qty, unit, unit_price, total}]
      subtotal REAL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      vat_amount REAL DEFAULT 0,
      shipping_cost REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      notes TEXT,
      terms TEXT,
      approved_by TEXT REFERENCES users(id),
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_po_tenant ON purchase_orders(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_po_vendor ON purchase_orders(vendor_id);
    CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);

    -- Inventory Items
    CREATE TABLE IF NOT EXISTS inventory_items (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      item_code TEXT UNIQUE NOT NULL,
      name_ar TEXT NOT NULL,
      name_en TEXT,
      category TEXT DEFAULT 'general',   -- general | spare_parts | cleaning_supplies | tools | furniture | electronics
      description TEXT,
      unit_type TEXT DEFAULT 'piece',    -- piece | box | liter | kg | meter | roll
      unit_cost REAL DEFAULT 0,
      current_stock REAL DEFAULT 0,
      min_stock REAL DEFAULT 0,
      max_stock REAL DEFAULT 0,
      location TEXT,
      property_id TEXT REFERENCES properties(id),
      vendor_id TEXT REFERENCES vendors(id),
      is_active INTEGER DEFAULT 1,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_inventory_tenant ON inventory_items(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory_items(category);

    -- Stock Movements
    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      item_id TEXT NOT NULL REFERENCES inventory_items(id),
      movement_type TEXT NOT NULL,       -- in | out | adjustment | transfer
      quantity REAL NOT NULL,
      unit_cost REAL,
      reference_type TEXT,               -- purchase_order | work_order | adjustment
      reference_id TEXT,
      notes TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS nafath_challenges (
      id TEXT PRIMARY KEY,
      national_id TEXT NOT NULL,
      phone TEXT NOT NULL,
      otp_code TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      expires_at TEXT NOT NULL,
      verified_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS otp_challenges (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      user_id TEXT,
      target TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'sms',
      purpose TEXT NOT NULL DEFAULT 'generic',
      otp_code TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      expires_at TEXT NOT NULL,
      verified_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Fal Marketing Contracts (عقود التسويق via منصة فال)
    CREATE TABLE IF NOT EXISTS fal_contracts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      contract_number TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'draft',
      -- Owner (مالك العقار)
      owner_name_ar TEXT NOT NULL,
      owner_national_id TEXT NOT NULL,
      owner_phone TEXT NOT NULL,
      owner_email TEXT,
      -- Broker / Licensee (الوسيط / المرخص)
      broker_name_ar TEXT NOT NULL,
      broker_license_no TEXT NOT NULL,
      broker_phone TEXT,
      broker_email TEXT,
      -- Property (العقار)
      property_id TEXT REFERENCES properties(id),
      unit_id TEXT REFERENCES units(id),
      property_address_ar TEXT,
      property_city TEXT DEFAULT 'ينبع',
      property_type TEXT,
      property_area_sqm REAL,
      -- Marketing terms
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      commission_type TEXT DEFAULT 'percentage',
      commission_value REAL DEFAULT 0,
      commission_flat_fee REAL DEFAULT 0,
      is_exclusive INTEGER DEFAULT 1,
      marketing_budget REAL DEFAULT 0,
      marketing_plan_ar TEXT,
      -- Fal integration
      fal_submitted_at TEXT,
      fal_approved_at TEXT,
      fal_contract_id TEXT,
      fal_status TEXT DEFAULT 'pending',
      fal_error TEXT,
      -- Terms
      special_conditions TEXT,
      notes TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_stock_item ON stock_movements(item_id);
    CREATE INDEX IF NOT EXISTS idx_stock_type ON stock_movements(movement_type);
    CREATE INDEX IF NOT EXISTS idx_otp_target ON otp_challenges(target);
    CREATE INDEX IF NOT EXISTS idx_otp_purpose ON otp_challenges(purpose);
    CREATE INDEX IF NOT EXISTS idx_fal_tenant ON fal_contracts(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_fal_status ON fal_contracts(status);
  `);

  // ALTER TABLE migrations (must run after CREATE TABLE for fresh databases)
  try { db.exec(`ALTER TABLE users ADD COLUMN password_hash TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE users ADD COLUMN customer_type TEXT DEFAULT 'individual'`); } catch(e) {}
  try { db.exec(`ALTER TABLE users ADD COLUMN reset_token TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE users ADD COLUMN reset_expires TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE purchases ADD COLUMN supplier_tax_number TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE purchase_orders ADD COLUMN supplier_tax_number TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE purchase_orders ADD COLUMN supplier_name TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE purchase_order_items ADD COLUMN tax_rate REAL DEFAULT 0.15`); } catch(e) {}
  try { db.exec(`ALTER TABLE utility_bills ADD COLUMN expense_category TEXT DEFAULT 'utilities'`); } catch(e) {}
  try { db.exec(`ALTER TABLE tenants ADD COLUMN fal_api_key TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE tenants ADD COLUMN fal_license_no TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE purchase_orders ADD COLUMN expense_category TEXT DEFAULT 'inventory'`); } catch(e) {}
  try { db.exec(`ALTER TABLE receipts ADD COLUMN najiz_ref TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE receipts ADD COLUMN najiz_status TEXT DEFAULT 'pending'`); } catch(e) {}
  try { db.exec(`ALTER TABLE receipts ADD COLUMN zatca_qr_code TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE units ADD COLUMN water_meter_no TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE units ADD COLUMN electricity_meter_no TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE units ADD COLUMN gas_meter_no TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE tenants ADD COLUMN vat_cycle TEXT DEFAULT 'monthly'`); } catch(e) {}
  try { db.exec(`ALTER TABLE renters ADD COLUMN customer_type TEXT DEFAULT 'individual'`); } catch(e) {}
  try { db.exec(`ALTER TABLE renters ADD COLUMN company_name_ar TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE renters ADD COLUMN cr_number TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE renters ADD COLUMN vat_number TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE renters ADD COLUMN national_address TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE renters ADD COLUMN customer_status TEXT DEFAULT 'active'`); } catch(e) {}
  try { db.exec(`ALTER TABLE properties ADD COLUMN management_type TEXT DEFAULT 'owned'`); } catch(e) {}
  try { db.exec(`ALTER TABLE properties ADD COLUMN owner_id TEXT REFERENCES owners(id)`); } catch(e) {}
  try { db.exec(`ALTER TABLE work_orders ADD COLUMN owner_cost REAL DEFAULT 0`); } catch(e) {}
  try { db.exec(`ALTER TABLE work_orders ADD COLUMN billed_to_owner INTEGER DEFAULT 0`); } catch(e) {}
  try { db.exec(`ALTER TABLE receipts ADD COLUMN owner_id TEXT REFERENCES owners(id)`); } catch(e) {}
  try { db.exec(`ALTER TABLE receipts ADD COLUMN trust_transfer_id TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE receipts ADD COLUMN trust_status TEXT DEFAULT 'pending'`); } catch(e) {}
  try { db.exec(`ALTER TABLE utility_bills ADD COLUMN meter_number TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE utility_bills ADD COLUMN unit_id TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE receipts ADD COLUMN approval_status TEXT DEFAULT 'pending'`); } catch(e) {}
  try { db.exec(`ALTER TABLE receipts ADD COLUMN approved_at TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE receipts ADD COLUMN approved_by TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE renters ADD COLUMN building_number TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE renters ADD COLUMN street TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE renters ADD COLUMN district TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE renters ADD COLUMN city TEXT DEFAULT 'ينبع'`); } catch(e) {}
  try { db.exec(`ALTER TABLE renters ADD COLUMN postal_code TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE renters ADD COLUMN sub_number TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE vendors ADD COLUMN building_number TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE vendors ADD COLUMN street TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE vendors ADD COLUMN district TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE vendors ADD COLUMN city TEXT DEFAULT 'ينبع'`); } catch(e) {}
  try { db.exec(`ALTER TABLE vendors ADD COLUMN postal_code TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE vendors ADD COLUMN sub_number TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE maintenance_tickets ADD COLUMN created_by TEXT REFERENCES users(id)`); } catch(e) {}
  try { db.exec(`ALTER TABLE receipts ADD COLUMN zatca_uuid TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE invoices ADD COLUMN zatca_uuid TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE invoices ADD COLUMN zatca_invoice_hash TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE invoices ADD COLUMN zatca_qr_code TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE invoices ADD COLUMN zatca_xml TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE invoices ADD COLUMN zatca_status TEXT DEFAULT 'pending'`); } catch(e) {}
  try { db.exec(`ALTER TABLE invoices ADD COLUMN zatca_response TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE audit_log ADD COLUMN details TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE audit_log ADD COLUMN created_at TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE properties ADD COLUMN branch_id TEXT REFERENCES branches(id)`); } catch(e) {}
  try { db.exec(`ALTER TABLE users ADD COLUMN branch_id TEXT REFERENCES branches(id)`); } catch(e) {}
  try { db.exec(`ALTER TABLE units ADD COLUMN branch_id TEXT REFERENCES branches(id)`); } catch(e) {}
  try { db.exec(`ALTER TABLE properties ADD COLUMN purchase_price REAL DEFAULT 0`); } catch(e) {}
  try { db.exec(`ALTER TABLE properties ADD COLUMN market_value REAL DEFAULT 0`); } catch(e) {}
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

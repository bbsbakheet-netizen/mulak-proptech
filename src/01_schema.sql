-- ============================================================
-- PropTech SaaS Platform — Complete PostgreSQL Schema
-- Multi-Tenant Architecture | Saudi Market
-- Version 1.0 | 2026
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- for Arabic/English search
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. TENANTS (SaaS Subscriber Companies)
-- ============================================================
CREATE TABLE tenants (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name_ar         VARCHAR(255) NOT NULL,
    name_en         VARCHAR(255) NOT NULL,
    cr_number       VARCHAR(20) UNIQUE NOT NULL,      -- Commercial Registration رقم السجل التجاري
    vat_number      VARCHAR(15) UNIQUE,               -- VAT رقم ضريبة القيمة المضافة
    nafath_entity_id VARCHAR(50),                     -- نفاذ Entity ID
    ijar_api_key    VARCHAR(255),                     -- منصة إيجار API
    zatca_cert      TEXT,                             -- ZATCA Certificate PEM
    zatca_private_key TEXT,
    najiz_token     VARCHAR(500),                     -- ناجز integration token
    logo_url        VARCHAR(500),
    address_ar      TEXT,
    address_en      TEXT,
    city            VARCHAR(100),
    country         CHAR(2) DEFAULT 'SA',
    phone           VARCHAR(20),
    email           VARCHAR(255),
    subscription_plan VARCHAR(50) DEFAULT 'starter',  -- starter | professional | enterprise
    subscription_expires_at TIMESTAMPTZ,
    is_active       BOOLEAN DEFAULT TRUE,
    settings        JSONB DEFAULT '{}',               -- locale, currency, etc.
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. USERS & AUTH (Nafath-linked)
-- ============================================================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    national_id     VARCHAR(10),                      -- رقم الهوية الوطنية / إقامة
    nafath_sub      VARCHAR(255) UNIQUE,              -- Nafath subject identifier
    full_name_ar    VARCHAR(255) NOT NULL,
    full_name_en    VARCHAR(255),
    email           VARCHAR(255),
    phone           VARCHAR(20),
    role            VARCHAR(50) DEFAULT 'staff',      -- owner | manager | accountant | staff | tenant_user
    is_active       BOOLEAN DEFAULT TRUE,
    last_login      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (tenant_id, email)
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_national_id ON users(national_id);

-- ============================================================
-- 3. PROPERTIES (Buildings / Compounds)
-- ============================================================
CREATE TABLE properties (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code            VARCHAR(30),                      -- internal code
    name_ar         VARCHAR(255) NOT NULL,
    name_en         VARCHAR(255),
    property_type   VARCHAR(50) NOT NULL,             -- residential | hotel | commercial | mixed
    deed_number     VARCHAR(50),                      -- رقم الصك
    parcel_number   VARCHAR(50),                      -- رقم القطعة
    city            VARCHAR(100),
    district        VARCHAR(100),
    address_ar      TEXT,
    address_en      TEXT,
    lat             DECIMAL(10,7),
    lng             DECIMAL(10,7),
    floors_count    SMALLINT DEFAULT 1,
    total_units     SMALLINT DEFAULT 0,               -- auto-maintained by trigger
    total_area_sqm  DECIMAL(12,2),
    year_built      SMALLINT,
    ijar_property_id VARCHAR(100),                    -- منصة إيجار property reference
    najiz_property_id VARCHAR(100),                   -- ناجز property reference
    status          VARCHAR(30) DEFAULT 'active',     -- active | inactive | under_maintenance
    notes           TEXT,
    meta            JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_properties_tenant ON properties(tenant_id);
CREATE INDEX idx_properties_type ON properties(property_type);

-- ============================================================
-- 4. UNITS (Apartments / Offices / Rooms)
-- ============================================================
CREATE TABLE units (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    unit_number     VARCHAR(30) NOT NULL,             -- auto-generated: 101, 102 ...
    unit_type       VARCHAR(50) NOT NULL,             -- apartment | hotel_room | suite | studio | office | shop
    floor_number    SMALLINT,
    area_sqm        DECIMAL(10,2),
    bedrooms        SMALLINT DEFAULT 0,
    bathrooms       SMALLINT DEFAULT 0,
    base_rent       DECIMAL(12,2) DEFAULT 0,          -- SAR/month
    status          VARCHAR(30) DEFAULT 'vacant',     -- vacant | occupied | maintenance | reserved | blocked
    ijar_unit_id    VARCHAR(100),
    features        JSONB DEFAULT '[]',               -- ["furnished","parking","balcony"]
    images          JSONB DEFAULT '[]',
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (property_id, unit_number)
);

CREATE INDEX idx_units_tenant ON units(tenant_id);
CREATE INDEX idx_units_property ON units(property_id);
CREATE INDEX idx_units_status ON units(status);

-- Auto-generate units when property total_units is set
CREATE OR REPLACE FUNCTION auto_generate_units()
RETURNS TRIGGER AS $$
DECLARE
    i INT;
    floor_num SMALLINT;
    unit_seq  INT;
    unit_num  VARCHAR(30);
    units_per_floor INT;
BEGIN
    -- Only run on INSERT or when total_units increases
    IF (TG_OP = 'UPDATE' AND NEW.total_units <= OLD.total_units) THEN
        RETURN NEW;
    END IF;

    -- Calculate units per floor
    units_per_floor := CEIL(NEW.total_units::FLOAT / GREATEST(NEW.floors_count, 1));

    -- Delete units beyond new count (if reducing)
    DELETE FROM units
    WHERE property_id = NEW.id
      AND tenant_id = NEW.tenant_id
      AND status = 'vacant'
      AND unit_number::INT > NEW.total_units;

    -- Insert missing units
    FOR i IN 1..NEW.total_units LOOP
        floor_num := CEIL(i::FLOAT / units_per_floor);
        unit_num  := floor_num::TEXT || LPAD(((i - 1) % units_per_floor + 1)::TEXT, 2, '0');

        INSERT INTO units (tenant_id, property_id, unit_number, unit_type, floor_number, base_rent)
        VALUES (NEW.tenant_id, NEW.id, unit_num,
                CASE WHEN NEW.property_type = 'hotel' THEN 'hotel_room'
                     WHEN NEW.property_type = 'commercial' THEN 'office'
                     ELSE 'apartment' END,
                floor_num, 0)
        ON CONFLICT (property_id, unit_number) DO NOTHING;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_generate_units
AFTER INSERT OR UPDATE OF total_units, floors_count ON properties
FOR EACH ROW EXECUTE FUNCTION auto_generate_units();

-- Keep total_units count synced
CREATE OR REPLACE FUNCTION sync_property_unit_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE properties
    SET total_units = (SELECT COUNT(*) FROM units WHERE property_id = NEW.property_id)
    WHERE id = NEW.property_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 5. TENANTS (Renters / المستأجرون)
-- ============================================================
CREATE TABLE renters (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    national_id     VARCHAR(10) NOT NULL,             -- هوية / إقامة
    id_type         VARCHAR(20) DEFAULT 'national',   -- national | iqama | passport | cr
    full_name_ar    VARCHAR(255) NOT NULL,
    full_name_en    VARCHAR(255),
    nafath_verified BOOLEAN DEFAULT FALSE,
    nafath_verified_at TIMESTAMPTZ,
    phone           VARCHAR(20),
    email           VARCHAR(255),
    nationality     CHAR(2) DEFAULT 'SA',
    employer        VARCHAR(255),
    monthly_income  DECIMAL(12,2),
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_renters_tenant ON renters(tenant_id);
CREATE INDEX idx_renters_national_id ON renters(national_id);

-- ============================================================
-- 6. RENTAL CONTRACTS
-- ============================================================
CREATE TABLE rental_contracts (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    contract_number     VARCHAR(50) UNIQUE NOT NULL,  -- auto: RC-2026-00001
    unit_id             UUID NOT NULL REFERENCES units(id),
    renter_id           UUID NOT NULL REFERENCES renters(id),
    start_date          DATE NOT NULL,
    end_date            DATE NOT NULL,
    annual_rent         DECIMAL(12,2) NOT NULL,
    monthly_rent        DECIMAL(12,2) GENERATED ALWAYS AS (annual_rent / 12) STORED,
    security_deposit    DECIMAL(12,2) DEFAULT 0,
    payment_frequency   VARCHAR(20) DEFAULT 'monthly',-- monthly|quarterly|semi_annual|annual
    installments_count  SMALLINT DEFAULT 12,
    grace_days          SMALLINT DEFAULT 5,
    -- Ijar integration
    ijar_contract_id    VARCHAR(100),
    ijar_status         VARCHAR(30) DEFAULT 'pending',-- pending|submitted|active|rejected
    ijar_submitted_at   TIMESTAMPTZ,
    -- Najiz integration
    najiz_contract_id   VARCHAR(100),
    najiz_status        VARCHAR(30) DEFAULT 'pending',
    -- Contract status
    status              VARCHAR(30) DEFAULT 'draft',  -- draft|active|expired|terminated|renewed
    termination_reason  TEXT,
    terminated_at       TIMESTAMPTZ,
    notes               TEXT,
    special_conditions  TEXT,
    pdf_url             VARCHAR(500),
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contracts_tenant ON rental_contracts(tenant_id);
CREATE INDEX idx_contracts_unit ON rental_contracts(unit_id);
CREATE INDEX idx_contracts_renter ON rental_contracts(renter_id);
CREATE INDEX idx_contracts_status ON rental_contracts(status);

-- Auto-number contracts
CREATE OR REPLACE FUNCTION generate_contract_number()
RETURNS TRIGGER AS $$
DECLARE v_year TEXT; v_seq INT;
BEGIN
    v_year := TO_CHAR(NOW(), 'YYYY');
    SELECT COALESCE(MAX(CAST(SUBSTRING(contract_number FROM 'RC-\d{4}-(\d+)') AS INT)), 0) + 1
    INTO v_seq FROM rental_contracts WHERE tenant_id = NEW.tenant_id;
    NEW.contract_number := 'RC-' || v_year || '-' || LPAD(v_seq::TEXT, 5, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_contract_number
BEFORE INSERT ON rental_contracts
FOR EACH ROW WHEN (NEW.contract_number IS NULL OR NEW.contract_number = '')
EXECUTE FUNCTION generate_contract_number();

-- ============================================================
-- 7. PAYMENT SCHEDULES & RECEIPTS (سندات القبض)
-- ============================================================
CREATE TABLE payment_schedules (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    contract_id     UUID NOT NULL REFERENCES rental_contracts(id) ON DELETE CASCADE,
    installment_no  SMALLINT NOT NULL,
    due_date        DATE NOT NULL,
    amount          DECIMAL(12,2) NOT NULL,
    vat_amount      DECIMAL(12,2) GENERATED ALWAYS AS (amount * 0.15) STORED,
    total_amount    DECIMAL(12,2) GENERATED ALWAYS AS (amount * 1.15) STORED,
    status          VARCHAR(20) DEFAULT 'pending',    -- pending|paid|overdue|partial|waived
    paid_amount     DECIMAL(12,2) DEFAULT 0,
    paid_date       DATE,
    payment_method  VARCHAR(30),                      -- bank_transfer|cash|check|sadad|mada
    reference_no    VARCHAR(100),
    receipt_id      UUID,                             -- FK to receipts added below
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_schedules_contract ON payment_schedules(contract_id);
CREATE INDEX idx_schedules_due_date ON payment_schedules(due_date);

-- Auto-generate payment schedule when contract is activated
CREATE OR REPLACE FUNCTION generate_payment_schedule()
RETURNS TRIGGER AS $$
DECLARE
    v_interval INTERVAL;
    i INT;
    v_due DATE;
    v_amount DECIMAL(12,2);
BEGIN
    IF NEW.status = 'active' AND OLD.status = 'draft' THEN
        v_amount := NEW.annual_rent / NEW.installments_count;
        v_interval := CASE NEW.payment_frequency
            WHEN 'monthly'      THEN INTERVAL '1 month'
            WHEN 'quarterly'    THEN INTERVAL '3 months'
            WHEN 'semi_annual'  THEN INTERVAL '6 months'
            WHEN 'annual'       THEN INTERVAL '12 months'
            ELSE INTERVAL '1 month'
        END;

        FOR i IN 1..NEW.installments_count LOOP
            v_due := NEW.start_date + (v_interval * (i-1));
            INSERT INTO payment_schedules (tenant_id, contract_id, installment_no, due_date, amount)
            VALUES (NEW.tenant_id, NEW.id, i, v_due, v_amount);
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generate_schedule
AFTER UPDATE ON rental_contracts
FOR EACH ROW EXECUTE FUNCTION generate_payment_schedule();

-- ============================================================
-- 8. RECEIPTS (سندات القبض)
-- ============================================================
CREATE TABLE receipts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    receipt_number  VARCHAR(50) UNIQUE NOT NULL,      -- RCP-2026-00001
    contract_id     UUID REFERENCES rental_contracts(id),
    schedule_id     UUID REFERENCES payment_schedules(id),
    renter_id       UUID REFERENCES renters(id),
    unit_id         UUID REFERENCES units(id),
    amount          DECIMAL(12,2) NOT NULL,
    vat_amount      DECIMAL(12,2) DEFAULT 0,
    total_amount    DECIMAL(12,2) NOT NULL,
    payment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method  VARCHAR(30) NOT NULL,
    reference_no    VARCHAR(100),
    description_ar  TEXT,
    description_en  TEXT,
    -- ZATCA e-invoice fields
    zatca_uuid      UUID DEFAULT uuid_generate_v4(),
    zatca_invoice_hash VARCHAR(500),
    zatca_qr_code   TEXT,                             -- Base64 TLV QR
    zatca_status    VARCHAR(30) DEFAULT 'pending',    -- pending|reported|cleared|failed
    zatca_submitted_at TIMESTAMPTZ,
    -- Najiz
    najiz_receipt_id VARCHAR(100),
    -- Status
    is_cancelled    BOOLEAN DEFAULT FALSE,
    cancelled_at    TIMESTAMPTZ,
    cancel_reason   TEXT,
    pdf_url         VARCHAR(500),
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_receipts_tenant ON receipts(tenant_id);
CREATE INDEX idx_receipts_contract ON receipts(contract_id);

-- Auto-number receipts
CREATE OR REPLACE FUNCTION generate_receipt_number()
RETURNS TRIGGER AS $$
DECLARE v_year TEXT; v_seq INT;
BEGIN
    v_year := TO_CHAR(NOW(), 'YYYY');
    SELECT COALESCE(MAX(CAST(SUBSTRING(receipt_number FROM 'RCP-\d{4}-(\d+)') AS INT)), 0) + 1
    INTO v_seq FROM receipts WHERE tenant_id = NEW.tenant_id;
    NEW.receipt_number := 'RCP-' || v_year || '-' || LPAD(v_seq::TEXT, 5, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_receipt_number
BEFORE INSERT ON receipts
FOR EACH ROW WHEN (NEW.receipt_number IS NULL OR NEW.receipt_number = '')
EXECUTE FUNCTION generate_receipt_number();

-- ============================================================
-- 9. INVOICES (فواتير - ZATCA Phase 2 Compliant)
-- ============================================================
CREATE TABLE invoices (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    invoice_number      VARCHAR(50) UNIQUE NOT NULL,  -- INV-2026-00001
    invoice_type        VARCHAR(20) DEFAULT 'standard',-- standard|simplified|credit|debit
    reference_id        UUID,                         -- contract or receipt id
    reference_type      VARCHAR(30),                  -- rental_contract|receipt|service
    buyer_name_ar       VARCHAR(255),
    buyer_name_en       VARCHAR(255),
    buyer_vat           VARCHAR(15),
    buyer_cr            VARCHAR(20),
    buyer_address       TEXT,
    -- Amounts
    subtotal            DECIMAL(12,2) NOT NULL,
    discount_amount     DECIMAL(12,2) DEFAULT 0,
    taxable_amount      DECIMAL(12,2) GENERATED ALWAYS AS (subtotal - discount_amount) STORED,
    vat_rate            DECIMAL(5,2) DEFAULT 15.00,
    vat_amount          DECIMAL(12,2) NOT NULL,
    rett_amount         DECIMAL(12,2) DEFAULT 0,      -- Real Estate Transaction Tax 5%
    total_amount        DECIMAL(12,2) NOT NULL,
    -- ZATCA fields
    zatca_uuid          UUID DEFAULT uuid_generate_v4(),
    zatca_invoice_hash  VARCHAR(500),
    zatca_previous_hash VARCHAR(500),
    zatca_qr_code       TEXT,
    zatca_xml           TEXT,                         -- Signed UBL XML
    zatca_status        VARCHAR(30) DEFAULT 'pending',
    zatca_response      JSONB,
    -- Dates
    issue_date          DATE NOT NULL DEFAULT CURRENT_DATE,
    supply_date         DATE,
    due_date            DATE,
    paid_at             TIMESTAMPTZ,
    status              VARCHAR(20) DEFAULT 'issued',  -- draft|issued|paid|cancelled
    notes               TEXT,
    pdf_url             VARCHAR(500),
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX idx_invoices_status ON invoices(status);

-- ============================================================
-- 10. QUOTATIONS (عروض الأسعار)
-- ============================================================
CREATE TABLE quotations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    quote_number    VARCHAR(50) UNIQUE NOT NULL,      -- QT-2026-00001
    quote_type      VARCHAR(30) DEFAULT 'rental',     -- rental|management|maintenance|service
    -- Client info
    client_name_ar  VARCHAR(255) NOT NULL,
    client_name_en  VARCHAR(255),
    client_phone    VARCHAR(20),
    client_email    VARCHAR(255),
    client_cr       VARCHAR(20),                      -- if company
    -- Property ref
    property_id     UUID REFERENCES properties(id),
    unit_id         UUID REFERENCES units(id),
    -- Financials
    items           JSONB NOT NULL DEFAULT '[]',      -- [{desc, qty, unit_price, vat}]
    subtotal        DECIMAL(12,2) DEFAULT 0,
    vat_amount      DECIMAL(12,2) DEFAULT 0,
    total_amount    DECIMAL(12,2) DEFAULT 0,
    discount_pct    DECIMAL(5,2) DEFAULT 0,
    discount_amount DECIMAL(12,2) DEFAULT 0,
    -- Validity
    valid_until     DATE,
    notes_ar        TEXT,
    notes_en        TEXT,
    terms_ar        TEXT,
    terms_en        TEXT,
    status          VARCHAR(20) DEFAULT 'draft',      -- draft|sent|accepted|rejected|expired
    accepted_at     TIMESTAMPTZ,
    converted_to    UUID REFERENCES rental_contracts(id),
    pdf_url         VARCHAR(500),
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_quotations_tenant ON quotations(tenant_id);

-- ============================================================
-- 11. OPERATIONAL CONTRACTS (عقود التشغيل: نظافة/إعاشة/أمن)
-- ============================================================
CREATE TABLE operational_contracts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    contract_number VARCHAR(50) UNIQUE NOT NULL,
    property_id     UUID REFERENCES properties(id),
    service_type    VARCHAR(50) NOT NULL,             -- cleaning|catering|security|elevator|ac|plumbing|other
    vendor_name_ar  VARCHAR(255) NOT NULL,
    vendor_name_en  VARCHAR(255),
    vendor_cr       VARCHAR(20),
    vendor_vat      VARCHAR(15),
    vendor_phone    VARCHAR(20),
    vendor_email    VARCHAR(255),
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    annual_value    DECIMAL(12,2) NOT NULL,
    monthly_value   DECIMAL(12,2) GENERATED ALWAYS AS (annual_value / 12) STORED,
    payment_frequency VARCHAR(20) DEFAULT 'monthly',
    scope_of_work_ar TEXT,
    scope_of_work_en TEXT,
    sla_response_hours SMALLINT DEFAULT 24,
    status          VARCHAR(20) DEFAULT 'active',
    auto_renew      BOOLEAN DEFAULT FALSE,
    renewal_notice_days SMALLINT DEFAULT 30,
    cost_center     VARCHAR(100),                     -- مركز التكلفة
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_op_contracts_tenant ON operational_contracts(tenant_id);
CREATE INDEX idx_op_contracts_property ON operational_contracts(property_id);

-- ============================================================
-- 12. MAINTENANCE WORK ORDERS (أوامر العمل)
-- ============================================================
CREATE TABLE work_orders (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_number    VARCHAR(50) UNIQUE NOT NULL,
    property_id     UUID REFERENCES properties(id),
    unit_id         UUID REFERENCES units(id),
    op_contract_id  UUID REFERENCES operational_contracts(id),
    order_type      VARCHAR(30) DEFAULT 'corrective', -- preventive|corrective|emergency
    service_type    VARCHAR(50),
    title_ar        VARCHAR(255) NOT NULL,
    title_en        VARCHAR(255),
    description     TEXT,
    priority        VARCHAR(20) DEFAULT 'medium',     -- low|medium|high|critical
    scheduled_date  DATE,
    completed_date  DATE,
    assigned_to     UUID REFERENCES users(id),
    estimated_cost  DECIMAL(12,2),
    actual_cost     DECIMAL(12,2),
    status          VARCHAR(20) DEFAULT 'open',       -- open|in_progress|completed|cancelled
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_work_orders_tenant ON work_orders(tenant_id);
CREATE INDEX idx_work_orders_property ON work_orders(property_id);

-- Auto-schedule preventive maintenance
CREATE OR REPLACE FUNCTION schedule_preventive_maintenance()
RETURNS void AS $$
DECLARE rec RECORD;
BEGIN
    FOR rec IN
        SELECT oc.*, p.name_ar, p.tenant_id
        FROM operational_contracts oc
        JOIN properties p ON p.id = oc.property_id
        WHERE oc.status = 'active'
          AND oc.end_date > CURRENT_DATE
    LOOP
        -- Monthly cleaning orders
        IF rec.service_type = 'cleaning' THEN
            INSERT INTO work_orders (
                tenant_id, property_id, op_contract_id,
                order_type, service_type, title_ar, title_en,
                scheduled_date, priority, status
            )
            SELECT rec.tenant_id, rec.property_id, rec.id,
                   'preventive', 'cleaning',
                   'صيانة وقائية - نظافة ' || rec.name_ar,
                   'Preventive Maintenance - Cleaning ' || rec.name_ar,
                   gs::DATE, 'medium', 'open'
            FROM generate_series(
                date_trunc('month', CURRENT_DATE),
                rec.end_date,
                INTERVAL '1 month'
            ) gs
            WHERE NOT EXISTS (
                SELECT 1 FROM work_orders wo
                WHERE wo.op_contract_id = rec.id
                  AND wo.scheduled_date = gs::DATE
            );
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 13. EMPLOYEES (موظفون)
-- ============================================================
CREATE TABLE employees (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_number VARCHAR(30) UNIQUE NOT NULL,
    national_id     VARCHAR(10) NOT NULL,
    id_type         VARCHAR(20) DEFAULT 'national',
    full_name_ar    VARCHAR(255) NOT NULL,
    full_name_en    VARCHAR(255),
    job_title_ar    VARCHAR(100),
    job_title_en    VARCHAR(100),
    department      VARCHAR(100),
    property_id     UUID REFERENCES properties(id),  -- assigned property
    hire_date       DATE NOT NULL,
    termination_date DATE,
    -- Salary
    basic_salary    DECIMAL(12,2) NOT NULL,
    housing_allowance DECIMAL(12,2) DEFAULT 0,
    transport_allowance DECIMAL(12,2) DEFAULT 0,
    other_allowances DECIMAL(12,2) DEFAULT 0,
    -- WPS fields
    bank_name       VARCHAR(100),
    iban            VARCHAR(34),
    -- GOSI
    gosi_number     VARCHAR(30),
    nationality     CHAR(2) DEFAULT 'SA',
    is_saudi        BOOLEAN DEFAULT TRUE,
    -- Commission
    commission_type VARCHAR(20) DEFAULT 'none',       -- none|percent|fixed
    commission_rate DECIMAL(5,2) DEFAULT 0,
    phone           VARCHAR(20),
    email           VARCHAR(255),
    status          VARCHAR(20) DEFAULT 'active',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_employees_tenant ON employees(tenant_id);

-- ============================================================
-- 14. PAYROLL (الرواتب - WPS SIF Compatible)
-- ============================================================
CREATE TABLE payroll_runs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    payroll_month   CHAR(7) NOT NULL,                -- 2026-06
    run_date        DATE NOT NULL DEFAULT CURRENT_DATE,
    total_employees INT DEFAULT 0,
    total_basic     DECIMAL(14,2) DEFAULT 0,
    total_allowances DECIMAL(14,2) DEFAULT 0,
    total_deductions DECIMAL(14,2) DEFAULT 0,
    total_commissions DECIMAL(14,2) DEFAULT 0,
    total_net       DECIMAL(14,2) DEFAULT 0,
    wps_file_ref    VARCHAR(100),                    -- WPS SIF file reference
    wps_status      VARCHAR(20) DEFAULT 'pending',   -- pending|submitted|processed|failed
    status          VARCHAR(20) DEFAULT 'draft',     -- draft|approved|paid
    notes           TEXT,
    approved_by     UUID REFERENCES users(id),
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payroll_lines (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    payroll_run_id  UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
    employee_id     UUID NOT NULL REFERENCES employees(id),
    basic_salary    DECIMAL(12,2) NOT NULL,
    housing_allowance DECIMAL(12,2) DEFAULT 0,
    transport_allowance DECIMAL(12,2) DEFAULT 0,
    other_allowances DECIMAL(12,2) DEFAULT 0,
    overtime_amount DECIMAL(12,2) DEFAULT 0,
    commission_amount DECIMAL(12,2) DEFAULT 0,
    gross_salary    DECIMAL(12,2) GENERATED ALWAYS AS (
        basic_salary + housing_allowance + transport_allowance +
        other_allowances + overtime_amount + commission_amount
    ) STORED,
    gosi_employee   DECIMAL(12,2) DEFAULT 0,        -- 10% Saudi / 1% non-Saudi
    gosi_employer   DECIMAL(12,2) DEFAULT 0,        -- 12% Saudi
    other_deductions DECIMAL(12,2) DEFAULT 0,
    net_salary      DECIMAL(12,2) NOT NULL,
    payment_status  VARCHAR(20) DEFAULT 'pending',
    bank_ref        VARCHAR(100),
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payroll_lines_run ON payroll_lines(payroll_run_id);
CREATE INDEX idx_payroll_lines_employee ON payroll_lines(employee_id);

-- ============================================================
-- 15. TAX RECORDS (ضرائب: VAT + RETT)
-- ============================================================
CREATE TABLE tax_records (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    record_type     VARCHAR(20) NOT NULL,             -- vat|rett
    reference_id    UUID NOT NULL,
    reference_type  VARCHAR(30) NOT NULL,
    tax_period      CHAR(7),                          -- 2026-Q2 or 2026-06
    taxable_amount  DECIMAL(12,2) NOT NULL,
    tax_rate        DECIMAL(5,2) NOT NULL,
    tax_amount      DECIMAL(12,2) NOT NULL,
    zatca_reference VARCHAR(100),
    status          VARCHAR(20) DEFAULT 'pending',    -- pending|filed|paid
    filed_at        TIMESTAMPTZ,
    due_date        DATE,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tax_records_tenant ON tax_records(tenant_id);
CREATE INDEX idx_tax_records_period ON tax_records(tax_period);

-- ============================================================
-- 16. AUDIT LOG
-- ============================================================
CREATE TABLE audit_log (
    id          BIGSERIAL PRIMARY KEY,
    tenant_id   UUID,
    user_id     UUID,
    action      VARCHAR(50) NOT NULL,                -- CREATE|UPDATE|DELETE|LOGIN|EXPORT
    table_name  VARCHAR(100),
    record_id   UUID,
    old_data    JSONB,
    new_data    JSONB,
    ip_address  INET,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_tenant ON audit_log(tenant_id);
CREATE INDEX idx_audit_created ON audit_log(created_at);

-- ============================================================
-- VIEWS
-- ============================================================

-- Occupancy dashboard view
CREATE OR REPLACE VIEW v_occupancy_dashboard AS
SELECT
    p.tenant_id,
    p.id AS property_id,
    p.name_ar,
    p.name_en,
    p.property_type,
    p.city,
    COUNT(u.id)                                          AS total_units,
    COUNT(u.id) FILTER (WHERE u.status = 'occupied')     AS occupied_units,
    COUNT(u.id) FILTER (WHERE u.status = 'vacant')       AS vacant_units,
    COUNT(u.id) FILTER (WHERE u.status = 'maintenance')  AS maintenance_units,
    ROUND(COUNT(u.id) FILTER (WHERE u.status = 'occupied')::NUMERIC /
          NULLIF(COUNT(u.id), 0) * 100, 2)              AS occupancy_rate,
    COALESCE(SUM(u.base_rent) FILTER (WHERE u.status = 'occupied'), 0) AS monthly_revenue
FROM properties p
LEFT JOIN units u ON u.property_id = p.id
GROUP BY p.tenant_id, p.id, p.name_ar, p.name_en, p.property_type, p.city;

-- Expiring contracts view (next 60 days)
CREATE OR REPLACE VIEW v_expiring_contracts AS
SELECT
    rc.*,
    u.unit_number,
    p.name_ar AS property_name_ar,
    p.name_en AS property_name_en,
    r.full_name_ar AS renter_name_ar,
    r.phone AS renter_phone,
    (rc.end_date - CURRENT_DATE) AS days_remaining
FROM rental_contracts rc
JOIN units u ON u.id = rc.unit_id
JOIN properties p ON p.id = u.property_id
JOIN renters r ON r.id = rc.renter_id
WHERE rc.status = 'active'
  AND rc.end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days'
ORDER BY rc.end_date;

-- Overdue payments view
CREATE OR REPLACE VIEW v_overdue_payments AS
SELECT
    ps.*,
    rc.contract_number,
    u.unit_number,
    p.name_ar AS property_name_ar,
    r.full_name_ar AS renter_name_ar,
    r.phone AS renter_phone,
    (CURRENT_DATE - ps.due_date) AS days_overdue
FROM payment_schedules ps
JOIN rental_contracts rc ON rc.id = ps.contract_id
JOIN units u ON u.id = rc.unit_id
JOIN properties p ON p.id = u.property_id
JOIN renters r ON r.id = rc.renter_id
WHERE ps.status IN ('pending', 'partial')
  AND ps.due_date < CURRENT_DATE
ORDER BY ps.due_date;

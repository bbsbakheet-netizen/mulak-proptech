# PropTech SaaS — دليل API الكامل وملف التوثيق
## Saudi Market | Multi-Tenant | NestJS + PostgreSQL

---

## API BASE URL
```
Production:  https://api.mulak.sa/v1
Staging:     https://staging-api.mulak.sa/v1
```

## AUTHENTICATION
```http
Authorization: Bearer <JWT_TOKEN>
X-Tenant-ID: <TENANT_UUID>
Content-Type: application/json
Accept-Language: ar | en
```

---

## 1. AUTH & NAFATH ENDPOINTS

### POST /auth/nafath/initiate
```json
REQUEST:
{
  "nationalId": "1000000001",
  "tenantSlug": "company-xyz",
  "language": "ar"
}

RESPONSE 200:
{
  "transactionId": "txn_9f3a2b1c-4d5e-6f7a-8b9c-0d1e2f3a4b5c",
  "randomNumber": 47,
  "expiresIn": 120,
  "message": "افتح تطبيق نفاذ وأدخل الرقم 47"
}
```

### POST /auth/nafath/verify
```json
REQUEST:
{ "transactionId": "txn_9f3a2b1c..." }

RESPONSE 200:
{
  "verified": true,
  "token": "eyJhbGciOiJSUzI1NiJ9...",
  "refreshToken": "eyJhbGciOiJSUzI1NiJ9...",
  "user": {
    "id": "uuid",
    "nationalId": "1000000001",
    "fullNameAr": "محمد بن عبدالله",
    "fullNameEn": "Mohammed Abdullah",
    "role": "owner",
    "tenantId": "tenant-uuid"
  }
}
```

### POST /auth/nafath/register
```json
REQUEST:
{
  "transactionId": "txn_9f3a2b1c...",
  "companyNameAr": "شركة الأملاك المتحدة",
  "companyNameEn": "United Properties Co.",
  "crNumber": "1010123456",
  "vatNumber": "300000000000003",
  "phone": "0500000001",
  "email": "admin@company.sa",
  "tenantPlan": "professional"
}

RESPONSE 201:
{
  "tenant": { "id": "tenant-uuid", "nameAr": "شركة الأملاك المتحدة" },
  "user": { "id": "user-uuid", "role": "owner" },
  "token": "eyJhbGciOiJSUzI1NiJ9...",
  "nafathVerified": true
}
```

---

## 2. PROPERTIES ENDPOINTS

### POST /properties
```json
REQUEST:
{
  "nameAr": "برج النخيل",
  "nameEn": "Al-Nakheel Tower",
  "propertyType": "residential",
  "city": "ينبع",
  "district": "حي الشاطئ",
  "deedNumber": "12345678901234",
  "floorsCount": 12,
  "totalUnits": 24,
  "totalAreaSqm": 4800,
  "ijarPropertyId": "3100001234"
}

RESPONSE 201:
{
  "property": { "id": "prop-uuid", "nameAr": "برج النخيل", ... },
  "unitsGenerated": 24,
  "units": [
    { "id": "unit-uuid", "unitNumber": "101", "floorNumber": 1, "status": "vacant" },
    { "id": "unit-uuid", "unitNumber": "102", "floorNumber": 1, "status": "vacant" },
    ...
  ],
  "message": "تم إنشاء العقار وتوليد 24 وحدة تلقائياً"
}
```

### GET /properties
```json
RESPONSE 200:
{
  "data": [
    {
      "id": "prop-uuid",
      "nameAr": "برج النخيل",
      "nameEn": "Al-Nakheel Tower",
      "propertyType": "residential",
      "city": "ينبع",
      "totalUnits": 24,
      "occupancyRate": 75.0,
      "monthlyRevenue": 96000
    }
  ],
  "total": 4,
  "page": 1,
  "pageSize": 20
}
```

### GET /properties/:id/units?status=vacant
```json
RESPONSE 200:
{
  "propertyId": "prop-uuid",
  "propertyNameAr": "برج النخيل",
  "units": [
    {
      "id": "unit-uuid",
      "unitNumber": "301",
      "floorNumber": 3,
      "unitType": "apartment",
      "areaSqm": 120,
      "baseRent": 4500,
      "status": "vacant",
      "features": ["parking", "balcony"]
    }
  ],
  "stats": {
    "total": 24, "occupied": 18, "vacant": 5, "maintenance": 1,
    "occupancyRate": 75.0
  }
}
```

### PUT /properties/:id
```json
REQUEST:
{
  "totalUnits": 30
}
RESPONSE 200:
{
  "property": { "totalUnits": 30, ... },
  "newUnitsGenerated": 6,
  "message": "تم إضافة 6 وحدات جديدة تلقائياً"
}
```

---

## 3. RENTAL CONTRACTS ENDPOINTS

### POST /contracts
```json
REQUEST:
{
  "unitId": "unit-uuid",
  "renterId": "renter-uuid",
  "startDate": "2026-06-01",
  "endDate": "2027-05-31",
  "annualRent": 60000,
  "securityDeposit": 5000,
  "paymentFrequency": "monthly",
  "installmentsCount": 12,
  "graceDays": 5,
  "specialConditions": "يشمل الإيجار مواقف السيارات",
  "landlordObligations": "...",
  "tenantObligations": "..."
}

RESPONSE 201:
{
  "contract": {
    "id": "contract-uuid",
    "contractNumber": "RC-2026-00005",
    "status": "draft"
  }
}
```

### PUT /contracts/:id/activate
```json
RESPONSE 200:
{
  "contract": { "contractNumber": "RC-2026-00005", "status": "active" },
  "scheduleGenerated": 12,
  "receiptsGenerated": 12,
  "receipts": [
    {
      "receiptNumber": "RCP-2026-00010",
      "installmentNo": 1,
      "dueDate": "2026-06-01",
      "amount": 5000,
      "vatAmount": 750,
      "totalAmount": 5750,
      "zatcaQrCode": "ARfYtdmE2YrZitmEINmF2YrYr9mK2K..."
    }
  ],
  "ijarStatus": "SUBMITTED",
  "ijarContractId": "IJAR-2026-445566",
  "najizStatus": "REGISTERED",
  "najizContractId": "NJZ-2026-00123",
  "zatcaFirstInvoice": { "uuid": "...", "status": "REPORTED" }
}
```

### POST /contracts/:id/ijar-sync
```json
REQUEST:
{
  "ijarPropertyId": "3100001234",
  "deedNumber": "12345678901234",
  "ownerNationalId": "1000000001"
}

RESPONSE 200:
{
  "ijarContractId": "IJAR-2026-445566",
  "status": "ACTIVE",
  "verificationCode": "7F3A",
  "contractUrl": "https://ejar.sa/contracts/IJAR-2026-445566",
  "smsNotification": "تم توثيق عقد الإيجار رقم IJAR-2026-445566 بنجاح"
}
```

### POST /contracts/:id/najiz-sync
```json
REQUEST:
{
  "courtCode": "CT-001",
  "parcelNumber": "12345",
  "deedNumber": "12345678901234"
}

RESPONSE 200:
{
  "najizContractId": "NJZ-2026-00123",
  "status": "REGISTERED",
  "documentUrl": "https://najiz.sa/documents/NJZ-2026-00123.pdf",
  "courtJurisdiction": "محكمة ينبع الابتدائية"
}
```

### GET /contracts/expiring?days=30
```json
RESPONSE 200:
{
  "data": [
    {
      "contractNumber": "RC-2026-00002",
      "renterName": "ليلى المالكي",
      "renterPhone": "0500000002",
      "unitNumber": "102",
      "propertyName": "برج النخيل",
      "endDate": "2026-06-15",
      "daysRemaining": 8,
      "annualRent": 57600
    }
  ]
}
```

---

## 4. RECEIPTS ENDPOINTS

### GET /receipts
```json
QUERY: ?contractId=uuid&status=pending&page=1&pageSize=20

RESPONSE 200:
{
  "data": [
    {
      "id": "receipt-uuid",
      "receiptNumber": "RCP-2026-00001",
      "contractNumber": "RC-2026-00001",
      "renterName": "أحمد الغامدي",
      "unitNumber": "101",
      "propertyName": "برج النخيل",
      "amount": 5000,
      "vatAmount": 750,
      "totalAmount": 5750,
      "paymentDate": "2026-06-01",
      "paymentMethod": "bank_transfer",
      "zatcaStatus": "reported",
      "zatcaQrCode": "ARfYtdmE2YrZitmE...",
      "pdfUrl": "https://cdn.mulak.sa/receipts/RCP-2026-00001.pdf"
    }
  ],
  "total": 48,
  "summary": {
    "totalAmount": 240000,
    "totalVat": 36000,
    "totalGrand": 276000
  }
}
```

### GET /receipts/:id/pdf
```
RESPONSE: application/pdf (binary)
```

### POST /receipts/:id/zatca-report
```json
REQUEST: {}

RESPONSE 200:
{
  "receiptId": "receipt-uuid",
  "zatcaUuid": "8e6b4e0b-...",
  "zatcaStatus": "REPORTED",
  "invoiceHash": "NWZlY2ViNjZmZmM4...",
  "qrCode": "ARfYtdmE2YrZitmE...",
  "submittedAt": "2026-06-03T09:14:00Z"
}
```

---

## 5. QUOTATIONS ENDPOINTS

### POST /quotations
```json
REQUEST:
{
  "quoteType": "rental",
  "clientNameAr": "شركة الإنشاءات المتحدة",
  "clientPhone": "0501234567",
  "clientEmail": "info@company.sa",
  "clientCr": "1010999888",
  "propertyId": "prop-uuid",
  "unitId": "unit-uuid",
  "items": [
    {
      "descriptionAr": "إيجار سنوي - وحدة 301",
      "descriptionEn": "Annual Rent - Unit 301",
      "qty": 1,
      "unitPrice": 60000,
      "includeVat": true
    },
    {
      "descriptionAr": "رسوم إدارة العقار 5%",
      "descriptionEn": "Property Management Fee 5%",
      "qty": 1,
      "unitPrice": 3000,
      "includeVat": true
    }
  ],
  "discountPct": 0,
  "validUntil": "2026-07-01",
  "notesAr": "العرض صالح لمدة 30 يوماً",
  "termsAr": "يخضع هذا العرض لأنظمة الإيجار السعودية"
}

RESPONSE 201:
{
  "quotation": {
    "id": "quote-uuid",
    "quoteNumber": "QT-2026-00003",
    "subtotal": 63000,
    "vatAmount": 9450,
    "totalAmount": 72450,
    "status": "draft"
  }
}
```

### PUT /quotations/:id/accept
```json
RESPONSE 200:
{
  "quotation": { "status": "accepted", "acceptedAt": "2026-06-03T10:00:00Z" },
  "contractCreated": {
    "id": "contract-uuid",
    "contractNumber": "RC-2026-00006",
    "status": "draft"
  },
  "message": "تم قبول العرض وتحويله إلى عقد إيجار مسودة"
}
```

---

## 6. PAYROLL ENDPOINTS

### POST /payroll/run
```json
REQUEST:
{
  "payrollMonth": "2026-06",
  "propertyId": null
}

RESPONSE 201:
{
  "payrollRun": {
    "id": "run-uuid",
    "payrollMonth": "2026-06",
    "totalEmployees": 12,
    "totalBasic": 68000,
    "totalAllowances": 24000,
    "totalDeductions": 6800,
    "totalCommissions": 3500,
    "totalNet": 88700,
    "status": "draft"
  },
  "lines": [
    {
      "employeeNameAr": "محمد القرشي",
      "basicSalary": 8000,
      "housingAllowance": 2000,
      "transportAllowance": 500,
      "gosiEmployee": 800,
      "gosiEmployer": 960,
      "netSalary": 9700,
      "iban": "SA0380000000608010167519"
    }
  ]
}
```

### GET /payroll/:id/sif
```
RESPONSE: text/plain (WPS SIF file)

EDR|1010000001|202606|000012|000000088700|SAR|20260625
EER|1000000001|SA0380000000608010167519|000000009700|SAR|محمد القرشي        |ANB|مدير العقارات
EER|1000000002|SA0380000000608010167520|000000007700|SAR|علي المزيني         |ANB|مشرف فندق
...
ETR|000012|000000088700
```

---

## 7. ZATCA FULL PAYLOAD

### POST → https://gw-fatoorah.zatca.gov.sa/e-invoicing/developer-portal/invoices/reporting/single

```json
REQUEST HEADERS:
{
  "Content-Type": "application/json",
  "Accept-Version": "V2",
  "Authorization": "Basic <base64(ZATCA_CERT:ZATCA_SECRET)>"
}

REQUEST BODY:
{
  "invoiceHash": "NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI4NTkyOTkwOWFiZTI3NTQ5MQ==",
  "uuid": "8e6b4e0b-1f4a-4e2d-b3d9-6c99c2d1234a",
  "invoice": "PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPEludm9pY2UgeG1sbnM9InVybjpvYXNpczpuYW1lczpzcGVjaWZpY2F0aW9uOnVibDpzY2hlbWE6eHNkOkludm9pY2UtMiI+..."
}

RESPONSE 200:
{
  "invoiceHash": "NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI4NTkyOTkwOWFiZTI3NTQ5MQ==",
  "status": "REPORTED",
  "warnings": [],
  "errors": [],
  "reportingStatus": "REPORTED",
  "clearanceStatus": "NOT_APPLICABLE",
  "qrSellersResponse": "ARfYtdmE2YrZitmEINmF2YrYr9mK2KfZhiAyMDI2LTA2LTAzVDA5OjE0OjAwWiAzMDAwMDAwMDAwMDAwMDMgNTc1MC4wMCA3NTAuMDA="
}

ERROR 400:
{
  "status": "ERROR",
  "errors": [
    {
      "code": "BR-01",
      "category": "BV",
      "message": "Invoice UUID must be unique"
    }
  ]
}
```

### ZATCA QR CODE — TLV Structure (Base64 Decoded)
```
Tag 1 (01): Seller Name        = "شركة الأملاك المتحدة"
Tag 2 (02): VAT Registration   = "300000000000003"
Tag 3 (03): Invoice Timestamp  = "2026-06-03T09:14:00Z"
Tag 4 (04): Invoice Total      = "5750.00"
Tag 5 (05): VAT Total          = "750.00"
```

---

## 8. IJAR API PAYLOAD (منصة إيجار)

### POST https://api.ejar.sa/api/v1/contracts

```json
REQUEST:
{
  "propertyRegistrationNumber": "3100001234",
  "unitNumber": "101",
  "landlordNationalId": "1000000001",
  "tenantNationalId": "1000000002",
  "contractStartDate": "2026-06-01",
  "contractEndDate": "2027-05-31",
  "annualRentAmount": 60000,
  "paymentPeriod": "MONTHLY",
  "contractType": "RESIDENTIAL",
  "city": "YANBU",
  "district": "AL_SHATI",
  "agreementOnRentIncrease": false,
  "contractLanguage": "AR",
  "securityDeposit": 5000,
  "specialConditions": "يشمل الإيجار مواقف السيارات"
}

RESPONSE 200:
{
  "contractId": "IJAR-2026-445566",
  "status": "ACTIVE",
  "verificationCode": "7F3A",
  "contractUrl": "https://ejar.sa/contracts/IJAR-2026-445566",
  "smsNotification": "تم توثيق عقد الإيجار رقم IJAR-2026-445566 بنجاح على منصة إيجار",
  "landlordSmsStatus": "SENT",
  "tenantSmsStatus": "SENT"
}

ERROR 422:
{
  "error": "PROPERTY_NOT_REGISTERED",
  "message": "العقار غير مسجل في منصة إيجار",
  "errorCode": "EJAR-422-001"
}
```

### PUT https://api.ejar.sa/api/v1/contracts/:ijarId/renew
```json
REQUEST:
{
  "newEndDate": "2028-05-31",
  "newAnnualRent": 65000,
  "renewalReason": "MUTUAL_AGREEMENT"
}

RESPONSE 200:
{
  "contractId": "IJAR-2026-445566",
  "status": "RENEWED",
  "newEndDate": "2028-05-31",
  "renewalContractId": "IJAR-2028-556677"
}
```

---

## 9. NAJIZ API PAYLOAD (ناجز)

### POST https://api.najiz.sa/realestate/v1/contracts/register

```json
REQUEST:
{
  "propertyDeedNumber": "12345678901234",
  "contractNumber": "RC-2026-00001",
  "lessorNationalId": "1000000001",
  "lesseeNationalId": "1000000002",
  "leaseStartDate": "2026-06-01",
  "leaseEndDate": "2027-05-31",
  "monthlyRent": 5000,
  "annualRent": 60000,
  "propertyType": "RESIDENTIAL",
  "city": "YANBU",
  "securityDeposit": 5000,
  "paymentFrequency": "MONTHLY",
  "ijarContractId": "IJAR-2026-445566",
  "courtCode": "CT-YNB-001",
  "parcelNumber": "12345"
}

RESPONSE 200:
{
  "najizContractId": "NJZ-2026-00123",
  "status": "REGISTERED",
  "registrationDate": "2026-06-03",
  "documentUrl": "https://najiz.sa/documents/NJZ-2026-00123.pdf",
  "courtJurisdiction": "محكمة ينبع الابتدائية",
  "caseReference": "CASE-2026-NJZ-00123"
}
```

---

## 10. WPS SIF FILE FORMAT (ملف حماية الأجور)

```
FIELD POSITIONS FOR SIF FILE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EDR RECORD (Employer Detail Record):
  [01]  Record Type       : EDR
  [02]  Employer ID       : CR Number (10 chars)
  [03]  Salary Month      : YYYYMM (6 chars)
  [04]  No. of Employees  : 6 digits (zero-padded)
  [05]  Total Salary      : 15 digits (fils, no decimal)
  [06]  Currency          : SAR
  [07]  Payment Date      : YYYYMMDD

EER RECORD (Employee Education Record):
  [01]  Record Type       : EER
  [02]  Employee ID       : National/Iqama (10 chars)
  [03]  IBAN              : SA + 22 digits
  [04]  Net Salary        : 15 digits (halalas, no decimal)
  [05]  Currency          : SAR
  [06]  Employee Name     : 50 chars
  [07]  Bank Code         : ANB|SAB|NCB|RJHI|etc.
  [08]  Job Title         : Free text

ETR RECORD (Employer Trailer Record):
  [01]  Record Type       : ETR
  [02]  Total Records     : 6 digits
  [03]  Total Amount      : 15 digits (halalas)

SAMPLE FILE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EDR|1010123456|202606|000012|000000008870000|SAR|20260625
EER|1000000001|SA0380000000608010167519|000000000970000|SAR|محمد القرشي                                       |ANB|مدير العقارات
EER|1000000002|SA0380000000608010167520|000000000770000|SAR|علي المزيني                                        |SAB|مشرف فندق
EER|1000000003|SA0380000000608010167521|000000000445000|SAR|عبدالله الرحيلي                                    |RJHI|حارس أمن
ETR|000012|000000008870000
```

---

## 11. ENVIRONMENT VARIABLES (.env)

```env
# App
NODE_ENV=production
PORT=3000
API_VERSION=v1
ALLOWED_ORIGINS=https://app.mulak.sa

# Database
DATABASE_URL=postgresql://user:pass@db.mulak.sa:5432/mulak_prod
DATABASE_POOL_MAX=20
DATABASE_SSL=true

# JWT
JWT_SECRET=<256-bit-random>
JWT_EXPIRES_IN=8h
JWT_REFRESH_EXPIRES_IN=30d

# Nafath
NAFATH_CLIENT_ID=mulak-client-id
NAFATH_CLIENT_SECRET=<secret>
NAFATH_BASE_URL=https://api.nafath.gov.sa/v1
NAFATH_SERVICE_NAME=PROPERTY_MGMT

# Ijar
IJAR_API_KEY=<ijar-api-key>
IJAR_BASE_URL=https://api.ejar.sa/api/v1
IJAR_ENVIRONMENT=production

# Najiz
NAJIZ_TOKEN=<najiz-auth-token>
NAJIZ_BASE_URL=https://api.najiz.sa/realestate/v1

# ZATCA
ZATCA_BASE_URL=https://gw-fatoorah.zatca.gov.sa/e-invoicing/developer-portal
ZATCA_CERT_PATH=/certs/zatca_cert.pem
ZATCA_PRIVATE_KEY_PATH=/certs/zatca_private.pem
ZATCA_OTP=<otp-from-fatoorah-portal>

# Storage
S3_BUCKET=mulak-documents
S3_REGION=me-south-1
S3_ACCESS_KEY=<key>
S3_SECRET_KEY=<secret>
CDN_URL=https://cdn.mulak.sa

# Email & SMS
SMTP_HOST=smtp.ses.amazonaws.com
SMS_PROVIDER=unifonic
SMS_API_KEY=<key>
SMS_SENDER_ID=MULAK

# Redis (caching & sessions)
REDIS_URL=redis://redis.mulak.sa:6379

# WPS
WPS_MOHRSD_URL=https://wps.mol.gov.sa/api
WPS_ENTITY_CODE=<entity-code>
```

---

## 12. DEPLOYMENT ARCHITECTURE

```
┌─────────────────────────────────────────────────────┐
│                    SAUDI REGION                      │
│                                                      │
│  ┌──────────┐    ┌──────────┐    ┌───────────────┐  │
│  │ CloudFront│───▶│  ALB    │───▶│  ECS Fargate  │  │
│  │   CDN    │    │ (HTTPS) │    │  NestJS x3    │  │
│  └──────────┘    └──────────┘    └───────┬───────┘  │
│                                          │           │
│  ┌───────────────┐    ┌─────────────────┴──────┐    │
│  │  RDS Aurora   │◀───│     Redis ElastiCache  │    │
│  │  PostgreSQL   │    │     (Sessions/Cache)   │    │
│  │  Multi-AZ     │    └────────────────────────┘    │
│  └───────────────┘                                   │
│                                                      │
│  External Integrations:                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐  │
│  │  نفاذ   │ │  إيجار  │ │  ناجز   │ │ ZATCA  │  │
│  │ Nafath  │ │  Ijar   │ │  Najiz  │ │ Phase2 │  │
│  └──────────┘ └──────────┘ └──────────┘ └────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## 13. PACKAGE.JSON (NestJS)

```json
{
  "name": "mulak-proptech-api",
  "version": "1.0.0",
  "description": "PropTech SaaS API - Saudi Market",
  "scripts": {
    "build": "nest build",
    "start:prod": "node dist/main",
    "start:dev": "nest start --watch",
    "migration:run": "typeorm migration:run",
    "migration:generate": "typeorm migration:generate",
    "seed": "ts-node src/database/seeds/run.ts",
    "test": "jest",
    "test:e2e": "jest --config ./test/jest-e2e.json"
  },
  "dependencies": {
    "@nestjs/common": "^10.0.0",
    "@nestjs/core": "^10.0.0",
    "@nestjs/jwt": "^10.2.0",
    "@nestjs/passport": "^10.0.3",
    "@nestjs/platform-express": "^10.0.0",
    "@nestjs/schedule": "^4.0.0",
    "@nestjs/swagger": "^7.3.0",
    "@nestjs/typeorm": "^10.0.2",
    "typeorm": "^0.3.20",
    "pg": "^8.11.3",
    "passport-jwt": "^4.0.1",
    "bcryptjs": "^2.4.3",
    "class-validator": "^0.14.1",
    "class-transformer": "^0.5.1",
    "axios": "^1.6.8",
    "xml2js": "^0.6.2",
    "qrcode": "^1.5.3",
    "puppeteer": "^22.6.0",
    "archiver": "^7.0.0",
    "ioredis": "^5.3.2",
    "multer": "^1.4.5",
    "@aws-sdk/client-s3": "^3.540.0",
    "uuid": "^9.0.1",
    "date-fns": "^3.6.0"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.0.0",
    "@types/pg": "^8.11.5",
    "typescript": "^5.1.3",
    "jest": "^29.5.0",
    "@types/jest": "^29.5.12"
  }
}
```

---

## 14. SECURITY CHECKLIST

```
✅ JWT RS256 (asymmetric keys)
✅ Tenant isolation on every query (tenant_id WHERE clause)
✅ Rate limiting (100 req/min per tenant)
✅ SQL injection prevention (parameterized queries via TypeORM)
✅ XSS protection (class-validator + sanitization)
✅ HTTPS enforced (TLS 1.3)
✅ ZATCA certificates stored encrypted (AWS KMS)
✅ Audit log for all CRUD operations
✅ Row-Level Security (RLS) in PostgreSQL
✅ API keys stored in AWS Secrets Manager
✅ Nafath verification before sensitive operations
✅ CORS whitelist (tenant domains only)
✅ File upload validation (type + size limits)
✅ Saudi data residency (me-south-1 Bahrain region)
```

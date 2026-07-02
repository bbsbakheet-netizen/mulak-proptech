// ============================================================
// PropTech SaaS Platform — NestJS Backend
// API Endpoints + Core Services
// Saudi Market | Multi-Tenant | 2026
// ============================================================

// ─── TYPES & DTOs ───────────────────────────────────────────

export interface TenantContext {
  tenantId: string;
  userId: string;
  role: string;
  lang: 'ar' | 'en';
}

// ─────────────────────────────────────────────────────────────
// MODULE 1: PROPERTIES & UNITS
// ─────────────────────────────────────────────────────────────

/**
 * POST   /api/v1/properties
 * GET    /api/v1/properties
 * GET    /api/v1/properties/:id
 * PUT    /api/v1/properties/:id
 * GET    /api/v1/properties/:id/units          ← auto-generated units
 * POST   /api/v1/properties/:id/units          ← add manual unit
 * GET    /api/v1/properties/:id/occupancy      ← live occupancy stats
 */

// properties.controller.ts
import {
  Controller, Get, Post, Put, Param, Body,
  UseGuards, Req, Query, HttpCode, HttpStatus
} from '@nestjs/common';
import { PropertiesService } from './properties.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';

@Controller('api/v1/properties')
@UseGuards(JwtAuthGuard, TenantGuard)
export class PropertiesController {
  constructor(private readonly svc: PropertiesService) {}

  @Post()
  async create(@Body() dto: CreatePropertyDto, @Req() req: any) {
    // When total_units is set, DB trigger auto-generates units
    return this.svc.create(req.tenant, dto);
  }

  @Get()
  async findAll(@Req() req: any, @Query() q: PropertyQueryDto) {
    return this.svc.findAll(req.tenant.tenantId, q);
  }

  @Get(':id/units')
  async getUnits(
    @Param('id') propertyId: string,
    @Req() req: any,
    @Query('status') status?: string,
  ) {
    return this.svc.getUnits(req.tenant.tenantId, propertyId, status);
  }

  @Get(':id/occupancy')
  async getOccupancy(@Param('id') id: string, @Req() req: any) {
    return this.svc.getOccupancy(req.tenant.tenantId, id);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePropertyDto,
    @Req() req: any,
  ) {
    // If total_units changes → trigger re-runs unit generation
    return this.svc.update(req.tenant.tenantId, id, dto);
  }
}

// properties.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';

@Injectable()
export class PropertiesService {
  constructor(
    @InjectRepository(Property) private propRepo: Repository<Property>,
    @InjectRepository(Unit) private unitRepo: Repository<Unit>,
    private ds: DataSource,
  ) {}

  async create(tenant: TenantContext, dto: CreatePropertyDto) {
    const prop = this.propRepo.create({ ...dto, tenantId: tenant.tenantId });
    const saved = await this.propRepo.save(prop);
    // DB trigger auto_generate_units fires → units created automatically
    const units = await this.unitRepo.find({
      where: { propertyId: saved.id, tenantId: tenant.tenantId },
      order: { unitNumber: 'ASC' },
    });
    return { property: saved, unitsGenerated: units.length, units };
  }

  async getUnits(tenantId: string, propertyId: string, status?: string) {
    const qb = this.unitRepo.createQueryBuilder('u')
      .where('u.tenant_id = :tenantId', { tenantId })
      .andWhere('u.property_id = :propertyId', { propertyId });
    if (status) qb.andWhere('u.status = :status', { status });
    qb.orderBy('u.floor_number', 'ASC').addOrderBy('u.unit_number', 'ASC');
    return qb.getMany();
  }

  async getOccupancy(tenantId: string, propertyId: string) {
    const result = await this.ds.query(
      `SELECT * FROM v_occupancy_dashboard
       WHERE tenant_id = $1 AND property_id = $2`,
      [tenantId, propertyId],
    );
    return result[0] ?? null;
  }

  async update(tenantId: string, id: string, dto: UpdatePropertyDto) {
    await this.propRepo.update({ id, tenantId }, dto);
    // If total_units changed, trigger fired automatically in DB
    return this.propRepo.findOne({ where: { id, tenantId } });
  }

  async findAll(tenantId: string, q: PropertyQueryDto) {
    return this.propRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }
}

// ─────────────────────────────────────────────────────────────
// MODULE 2: RENTAL CONTRACTS + AUTO RECEIPT GENERATION
// ─────────────────────────────────────────────────────────────

/**
 * POST  /api/v1/contracts                 ← create draft
 * PUT   /api/v1/contracts/:id/activate    ← activate → auto-generates schedule + receipts
 * GET   /api/v1/contracts/:id/schedule    ← payment schedule
 * GET   /api/v1/contracts/:id/receipts    ← all receipts
 * POST  /api/v1/contracts/:id/ijar-sync   ← push to منصة إيجار
 * POST  /api/v1/contracts/:id/najiz-sync  ← push to ناجز
 * GET   /api/v1/contracts/expiring        ← expiring in 60 days
 */

@Controller('api/v1/contracts')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ContractsController {
  constructor(private readonly svc: ContractsService) {}

  @Post()
  async create(@Body() dto: CreateContractDto, @Req() req: any) {
    return this.svc.createDraft(req.tenant, dto);
  }

  @Put(':id/activate')
  async activate(@Param('id') id: string, @Req() req: any) {
    // Activating triggers: payment schedule + receipt generation + ijar sync
    return this.svc.activate(req.tenant, id);
  }

  @Get(':id/schedule')
  async getSchedule(@Param('id') id: string, @Req() req: any) {
    return this.svc.getSchedule(req.tenant.tenantId, id);
  }

  @Post(':id/ijar-sync')
  async syncIjar(@Param('id') id: string, @Req() req: any) {
    return this.svc.syncWithIjar(req.tenant, id);
  }

  @Post(':id/najiz-sync')
  async syncNajiz(@Param('id') id: string, @Req() req: any) {
    return this.svc.syncWithNajiz(req.tenant, id);
  }

  @Get('expiring')
  async getExpiring(@Req() req: any) {
    return this.svc.getExpiring(req.tenant.tenantId);
  }
}

@Injectable()
export class ContractsService {
  constructor(
    @InjectRepository(RentalContract) private contractRepo: Repository<RentalContract>,
    @InjectRepository(PaymentSchedule) private schedRepo: Repository<PaymentSchedule>,
    private receiptService: ReceiptService,
    private ijarService: IjarService,
    private najizService: NajizService,
    private zatcaService: ZatcaService,
    private ds: DataSource,
  ) {}

  async createDraft(tenant: TenantContext, dto: CreateContractDto) {
    const contract = this.contractRepo.create({
      ...dto,
      tenantId: tenant.tenantId,
      createdBy: tenant.userId,
      status: 'draft',
    });
    return this.contractRepo.save(contract);
    // contract_number auto-generated by DB trigger
  }

  async activate(tenant: TenantContext, contractId: string) {
    const contract = await this.contractRepo.findOneOrFail({
      where: { id: contractId, tenantId: tenant.tenantId },
      relations: ['unit', 'renter'],
    });

    // 1. Activate → DB trigger generates payment schedule
    await this.contractRepo.update(contractId, { status: 'active' });

    // 2. Mark unit as occupied
    await this.ds.query(
      `UPDATE units SET status = 'occupied' WHERE id = $1`,
      [contract.unitId],
    );

    // 3. Load generated schedule
    const schedule = await this.getSchedule(tenant.tenantId, contractId);

    // 4. Auto-generate receipts (سندات القبض) for each installment
    const receipts = await this.receiptService.bulkCreateFromSchedule(
      tenant, contract, schedule,
    );

    // 5. Push to Ijar
    let ijarResult = null;
    try {
      ijarResult = await this.ijarService.registerContract(tenant, contract);
    } catch (e) {
      console.error('[Ijar] sync failed:', e.message);
    }

    // 6. Push first invoice to ZATCA
    const firstInstallment = schedule[0];
    if (firstInstallment) {
      await this.zatcaService.issueInvoice(tenant, {
        referenceId: contractId,
        referenceType: 'rental_contract',
        buyerNameAr: contract.renter.fullNameAr,
        buyerPhone: contract.renter.phone,
        subtotal: firstInstallment.amount,
        vatAmount: firstInstallment.vatAmount,
        totalAmount: firstInstallment.totalAmount,
        issueDate: new Date(),
      });
    }

    return {
      contract: { ...contract, status: 'active' },
      scheduleCount: schedule.length,
      receiptsGenerated: receipts.length,
      ijarStatus: ijarResult?.status ?? 'pending',
    };
  }

  async getSchedule(tenantId: string, contractId: string) {
    return this.schedRepo.find({
      where: { contractId, tenantId },
      order: { installmentNo: 'ASC' },
    });
  }

  async getExpiring(tenantId: string) {
    return this.ds.query(
      `SELECT * FROM v_expiring_contracts WHERE tenant_id = $1`,
      [tenantId],
    );
  }

  async syncWithIjar(tenant: TenantContext, contractId: string) {
    const contract = await this.contractRepo.findOneOrFail({
      where: { id: contractId, tenantId: tenant.tenantId },
      relations: ['unit', 'renter', 'unit.property'],
    });
    return this.ijarService.registerContract(tenant, contract);
  }

  async syncWithNajiz(tenant: TenantContext, contractId: string) {
    const contract = await this.contractRepo.findOneOrFail({
      where: { id: contractId, tenantId: tenant.tenantId },
      relations: ['unit', 'renter', 'unit.property'],
    });
    return this.najizService.registerContract(tenant, contract);
  }
}

// ─────────────────────────────────────────────────────────────
// MODULE 3: RECEIPTS SERVICE (سندات القبض)
// ─────────────────────────────────────────────────────────────

/**
 * GET  /api/v1/receipts
 * GET  /api/v1/receipts/:id
 * POST /api/v1/receipts/:id/zatca-report   ← report to ZATCA
 * GET  /api/v1/receipts/:id/pdf            ← generate PDF
 */

@Injectable()
export class ReceiptService {
  constructor(
    @InjectRepository(Receipt) private receiptRepo: Repository<Receipt>,
    private zatcaService: ZatcaService,
  ) {}

  /** Auto-generate receipts for all installments when contract activates */
  async bulkCreateFromSchedule(
    tenant: TenantContext,
    contract: RentalContract,
    schedule: PaymentSchedule[],
  ): Promise<Receipt[]> {
    const receipts: Receipt[] = [];

    for (const inst of schedule) {
      const receipt = this.receiptRepo.create({
        tenantId: tenant.tenantId,
        contractId: contract.id,
        scheduleId: inst.id,
        renterId: contract.renterId,
        unitId: contract.unitId,
        amount: inst.amount,
        vatAmount: inst.vatAmount,
        totalAmount: inst.totalAmount,
        paymentDate: inst.dueDate,
        paymentMethod: 'bank_transfer',
        descriptionAr: `إيجار - دفعة ${inst.installmentNo} - ${contract.contractNumber}`,
        descriptionEn: `Rent - Installment ${inst.installmentNo} - ${contract.contractNumber}`,
        createdBy: tenant.userId,
      });
      // receipt_number auto-generated by DB trigger
      const saved = await this.receiptRepo.save(receipt);

      // Generate ZATCA QR for each receipt
      const qr = await this.zatcaService.generateQRCode({
        sellerName: 'شركة إدارة الأملاك',
        vatNumber: '300000000000003',
        timestamp: new Date(inst.dueDate).toISOString(),
        invoiceTotal: inst.totalAmount.toString(),
        vatTotal: inst.vatAmount.toString(),
      });
      await this.receiptRepo.update(saved.id, { zatcaQrCode: qr });
      receipts.push(saved);
    }

    return receipts;
  }

  async getReceiptPdf(tenantId: string, receiptId: string): Promise<Buffer> {
    const receipt = await this.receiptRepo.findOneOrFail({
      where: { id: receiptId, tenantId },
      relations: ['contract', 'renter', 'unit', 'unit.property'],
    });
    return this.generateReceiptPdf(receipt);
  }

  private async generateReceiptPdf(receipt: Receipt): Promise<Buffer> {
    // Uses puppeteer/wkhtmltopdf to render Arabic HTML → PDF
    const html = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8"/>
        <style>
          body { font-family: 'Noto Naskh Arabic', serif; direction: rtl; }
          .header { text-align: center; border-bottom: 2px solid #1a3a5c; padding-bottom: 12px; }
          .qr { text-align: center; margin: 20px 0; }
          .table { width: 100%; border-collapse: collapse; }
          .table td, .table th { border: 1px solid #ccc; padding: 8px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>سند قبض</h2>
          <h2>Receipt Voucher</h2>
          <p>رقم: ${receipt.receiptNumber}</p>
        </div>
        <table class="table">
          <tr><th>البيان</th><th>Description</th><th>القيمة</th></tr>
          <tr><td>المستأجر</td><td>Tenant</td><td>${receipt.renter?.fullNameAr}</td></tr>
          <tr><td>الوحدة</td><td>Unit</td><td>${receipt.unit?.unitNumber} - ${receipt.unit?.property?.nameAr}</td></tr>
          <tr><td>المبلغ</td><td>Amount</td><td>${receipt.amount.toLocaleString('ar-SA')} ريال</td></tr>
          <tr><td>ضريبة القيمة المضافة 15%</td><td>VAT 15%</td><td>${receipt.vatAmount.toLocaleString('ar-SA')} ريال</td></tr>
          <tr><td>الإجمالي</td><td>Total</td><td>${receipt.totalAmount.toLocaleString('ar-SA')} ريال</td></tr>
          <tr><td>طريقة الدفع</td><td>Payment Method</td><td>${receipt.paymentMethod}</td></tr>
        </table>
        <div class="qr">
          <img src="data:image/png;base64,${receipt.zatcaQrCode}" width="120"/>
          <p style="font-size:10px">رمز الاستجابة السريعة - ZATCA QR Code</p>
        </div>
      </body>
      </html>`;
    // Return rendered PDF buffer
    return Buffer.from(html); // Replace with actual PDF renderer
  }
}

// ─────────────────────────────────────────────────────────────
// MODULE 4: ZATCA SERVICE (هيئة الزكاة والضريبة - Phase 2)
// ─────────────────────────────────────────────────────────────

import * as crypto from 'crypto';

@Injectable()
export class ZatcaService {
  private readonly ZATCA_BASE_URL = 'https://gw-fatoorah.zatca.gov.sa/e-invoicing/developer-portal';

  /** Generate ZATCA-compliant QR Code (TLV Base64) */
  async generateQRCode(data: {
    sellerName: string;
    vatNumber: string;
    timestamp: string;
    invoiceTotal: string;
    vatTotal: string;
  }): Promise<string> {
    const tlv = (tag: number, value: string): Buffer => {
      const valueBuffer = Buffer.from(value, 'utf8');
      return Buffer.concat([
        Buffer.from([tag]),
        Buffer.from([valueBuffer.length]),
        valueBuffer,
      ]);
    };

    const qrBuffer = Buffer.concat([
      tlv(1, data.sellerName),
      tlv(2, data.vatNumber),
      tlv(3, data.timestamp),
      tlv(4, data.invoiceTotal),
      tlv(5, data.vatTotal),
    ]);

    return qrBuffer.toString('base64');
  }

  /** Calculate VAT and prepare ZATCA invoice payload */
  async issueInvoice(tenant: TenantContext, params: {
    referenceId: string;
    referenceType: string;
    buyerNameAr: string;
    buyerPhone?: string;
    buyerVat?: string;
    subtotal: number;
    vatAmount: number;
    totalAmount: number;
    issueDate: Date;
    invoiceType?: 'standard' | 'simplified';
  }) {
    const tenantRecord = await this.getTenantZatcaConfig(tenant.tenantId);

    // Build UBL 2.1 XML (simplified representation)
    const invoiceUUID = crypto.randomUUID();
    const xml = this.buildZatcaXML({
      uuid: invoiceUUID,
      issueDate: params.issueDate.toISOString().split('T')[0],
      issueTime: params.issueDate.toISOString().split('T')[1].substring(0, 8),
      invoiceType: params.invoiceType ?? 'simplified',
      sellerName: tenantRecord.nameAr,
      sellerVat: tenantRecord.vatNumber,
      buyerName: params.buyerNameAr,
      buyerVat: params.buyerVat,
      lineAmount: params.subtotal,
      vatAmount: params.vatAmount,
      totalAmount: params.totalAmount,
    });

    // Sign XML with ZATCA certificate
    const signedXml = this.signXml(xml, tenantRecord.zatcaPrivateKey);
    const invoiceHash = crypto.createHash('sha256').update(signedXml).digest('base64');

    // Generate QR
    const qrCode = await this.generateQRCode({
      sellerName: tenantRecord.nameAr,
      vatNumber: tenantRecord.vatNumber ?? '',
      timestamp: params.issueDate.toISOString(),
      invoiceTotal: params.totalAmount.toFixed(2),
      vatTotal: params.vatAmount.toFixed(2),
    });

    // Submit to ZATCA
    const payload = this.buildZatcaPayload(signedXml, invoiceHash, invoiceUUID);
    const response = await this.submitToZatca(payload, tenantRecord.zatcaCert);

    return {
      uuid: invoiceUUID,
      hash: invoiceHash,
      qrCode,
      zatcaStatus: response.status,
      zatcaResponse: response,
    };
  }

  private buildZatcaXML(data: Record<string, any>): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>${data.uuid}</cbc:ID>
  <cbc:UUID>${data.uuid}</cbc:UUID>
  <cbc:IssueDate>${data.issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${data.issueTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="${data.invoiceType === 'simplified' ? '0200000' : '0100000'}">388</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${data.sellerName}</cbc:Name></cac:PartyName>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${data.sellerVat}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${data.buyerName}</cbc:Name></cac:PartyName>
      ${data.buyerVat ? `<cac:PartyTaxScheme><cbc:CompanyID>${data.buyerVat}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : ''}
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="SAR">${data.vatAmount.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="SAR">${data.lineAmount.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="SAR">${data.vatAmount.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>15</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="SAR">${data.lineAmount.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="SAR">${data.lineAmount.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="SAR">${data.totalAmount.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="SAR">${data.totalAmount.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`;
  }

  private buildZatcaPayload(signedXml: string, hash: string, uuid: string) {
    return {
      invoiceHash: hash,
      uuid,
      invoice: Buffer.from(signedXml).toString('base64'),
    };
  }

  private signXml(xml: string, privateKeyPem: string): string {
    if (!privateKeyPem) return xml; // dev mode
    const sign = crypto.createSign('SHA256');
    sign.update(xml);
    const signature = sign.sign(privateKeyPem, 'base64');
    return xml.replace('</Invoice>', `<Signature>${signature}</Signature></Invoice>`);
  }

  private async submitToZatca(payload: any, cert: string) {
    // In production: axios.post(ZATCA_BASE_URL + '/invoices/reporting/single', payload, { headers: { Authorization: `Basic ${cert}` } })
    console.log('[ZATCA] Submitting invoice:', payload.uuid);
    return { status: 'REPORTED', clearanceStatus: 'NOT_APPLICABLE' };
  }

  private async getTenantZatcaConfig(tenantId: string) {
    // Fetch from DB
    return { nameAr: 'الشركة', vatNumber: '300000000000003', zatcaCert: '', zatcaPrivateKey: '' };
  }
}

// ─────────────────────────────────────────────────────────────
// MODULE 5: IJAR SERVICE (منصة إيجار)
// ─────────────────────────────────────────────────────────────

@Injectable()
export class IjarService {
  private readonly BASE_URL = 'https://api.ejar.sa/api/v1';

  async registerContract(tenant: TenantContext, contract: any) {
    const tenantConfig = await this.getTenantConfig(tenant.tenantId);

    const payload = {
      propertyRegistrationNumber: contract.unit?.property?.ijarPropertyId,
      unitNumber: contract.unit?.unitNumber,
      landlordNationalId: tenantConfig.ownerNationalId,
      tenantNationalId: contract.renter?.nationalId,
      contractStartDate: contract.startDate,
      contractEndDate: contract.endDate,
      annualRentAmount: contract.annualRent,
      paymentPeriod: contract.paymentFrequency,
      contractType: 'residential',
      city: contract.unit?.property?.city,
      district: contract.unit?.property?.district,
    };

    // POST to Ijar API
    console.log('[Ijar] Registering contract:', payload);
    // const response = await axios.post(`${this.BASE_URL}/contracts`, payload, {
    //   headers: { Authorization: `Bearer ${tenantConfig.ijarApiKey}` }
    // });

    const mockResponse = {
      contractId: `IJAR-${Date.now()}`,
      status: 'SUBMITTED',
      verificationCode: crypto.randomBytes(4).toString('hex').toUpperCase(),
    };

    // Update contract with Ijar reference
    console.log('[Ijar] Contract registered:', mockResponse.contractId);
    return mockResponse;
  }

  async renewContract(tenant: TenantContext, ijarContractId: string, newEndDate: string) {
    console.log('[Ijar] Renewing contract:', ijarContractId);
    return { status: 'RENEWED', newEndDate };
  }

  private async getTenantConfig(tenantId: string) {
    return { ownerNationalId: '1000000001', ijarApiKey: 'mock-key' };
  }
}

// ─────────────────────────────────────────────────────────────
// MODULE 6: NAJIZ SERVICE (ناجز)
// ─────────────────────────────────────────────────────────────

@Injectable()
export class NajizService {
  private readonly BASE_URL = 'https://api.najiz.sa/realestate/v1';

  async registerContract(tenant: TenantContext, contract: any) {
    const payload = {
      propertyDeedNumber: contract.unit?.property?.deedNumber,
      contractNumber: contract.contractNumber,
      lessorNationalId: await this.getOwnerNationalId(tenant.tenantId),
      lesseeNationalId: contract.renter?.nationalId,
      leaseStartDate: contract.startDate,
      leaseEndDate: contract.endDate,
      monthlyRent: contract.monthlyRent,
      propertyType: contract.unit?.property?.propertyType,
      city: contract.unit?.property?.city,
    };

    console.log('[Najiz] Registering contract:', payload);
    // const response = await axios.post(`${BASE_URL}/contracts/register`, payload, ...)

    return {
      najizContractId: `NJZ-${Date.now()}`,
      status: 'REGISTERED',
      documentUrl: `https://najiz.sa/contracts/NJZ-${Date.now()}.pdf`,
    };
  }

  private async getOwnerNationalId(tenantId: string) {
    return '1000000001';
  }
}

// ─────────────────────────────────────────────────────────────
// MODULE 7: NAFATH AUTH SERVICE (نفاذ)
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/v1/auth/nafath/initiate   ← start Nafath auth flow
 * POST /api/v1/auth/nafath/verify     ← verify response from Nafath
 * POST /api/v1/auth/nafath/register   ← new user registration with NID
 */

@Controller('api/v1/auth/nafath')
export class NafathController {
  constructor(private nafathService: NafathService) {}

  @Post('initiate')
  @HttpCode(HttpStatus.OK)
  async initiate(@Body() dto: { nationalId: string; tenantSlug: string }) {
    return this.nafathService.initiateAuth(dto.nationalId, dto.tenantSlug);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(@Body() dto: { transactionId: string; otp?: string }) {
    return this.nafathService.verifyAndIssueToken(dto.transactionId);
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterWithNafathDto) {
    return this.nafathService.registerUser(dto);
  }
}

@Injectable()
export class NafathService {
  private readonly NAFATH_URL = 'https://api.nafath.gov.sa/v1';

  async initiateAuth(nationalId: string, tenantSlug: string) {
    // Generate random number (1-99) for Nafath app
    const randomNumber = Math.floor(Math.random() * 99) + 1;
    const transactionId = crypto.randomUUID();

    // POST to Nafath API to create auth request
    // const resp = await axios.post(`${NAFATH_URL}/users/${nationalId}/confirmation`, {
    //   service: 'PROPERTY_MGMT', transactionId, randomNumber
    // });

    console.log('[Nafath] Auth initiated for:', nationalId, 'Random:', randomNumber);

    return {
      transactionId,
      randomNumber,       // user sees this in Nafath app and confirms
      expiresIn: 120,     // seconds
      message_ar: 'يرجى فتح تطبيق نفاذ وتأكيد الرقم المعروض',
      message_en: 'Please open Nafath app and confirm the displayed number',
    };
  }

  async verifyAndIssueToken(transactionId: string) {
    // Poll Nafath for confirmation status
    // const status = await axios.get(`${NAFATH_URL}/confirmation/${transactionId}`)

    const mockUser = {
      nationalId: '1000000001',
      nameAr: 'محمد بن عبدالله',
      nameEn: 'Mohammed Abdullah',
      dob: '1990-01-01',
      gender: 'M',
      phone: '05XXXXXXXX',
    };

    // Issue JWT token
    const token = this.issueJwt(mockUser);
    return { verified: true, token, user: mockUser };
  }

  async registerUser(dto: RegisterWithNafathDto) {
    // 1. Verify national ID with Nafath
    const nafathData = await this.verifyAndIssueToken(dto.transactionId);
    if (!nafathData.verified) throw new Error('Nafath verification failed');

    // 2. Create user in DB
    const user = {
      nationalId: nafathData.user.nationalId,
      nafathSub: dto.transactionId,
      fullNameAr: nafathData.user.nameAr,
      fullNameEn: nafathData.user.nameEn,
      phone: nafathData.user.phone,
      tenantId: dto.tenantId,
      role: 'owner',
    };

    console.log('[Nafath] Registering user:', user.nationalId);
    return { success: true, user, token: nafathData.token };
  }

  private issueJwt(user: any): string {
    // Use @nestjs/jwt JwtService.sign() in production
    return `jwt.${Buffer.from(JSON.stringify(user)).toString('base64')}.signature`;
  }
}

// ─────────────────────────────────────────────────────────────
// MODULE 8: PAYROLL SERVICE (مسير الرواتب - WPS SIF)
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/v1/payroll/run          ← create monthly payroll run
 * GET  /api/v1/payroll/:id/sif      ← export WPS SIF file
 * PUT  /api/v1/payroll/:id/approve  ← approve and submit to WPS
 */

@Injectable()
export class PayrollService {
  constructor(
    @InjectRepository(PayrollRun) private runRepo: Repository<PayrollRun>,
    @InjectRepository(PayrollLine) private lineRepo: Repository<PayrollLine>,
    @InjectRepository(Employee) private empRepo: Repository<Employee>,
  ) {}

  async createMonthlyRun(tenant: TenantContext, month: string) {
    const employees = await this.empRepo.find({
      where: { tenantId: tenant.tenantId, status: 'active' },
    });

    const run = await this.runRepo.save({
      tenantId: tenant.tenantId,
      payrollMonth: month,
      runDate: new Date(),
      createdBy: tenant.userId,
      status: 'draft',
      totalEmployees: employees.length,
    });

    let totalBasic = 0, totalAllowances = 0, totalDeductions = 0, totalNet = 0;

    for (const emp of employees) {
      const gross = emp.basicSalary + emp.housingAllowance +
                    emp.transportAllowance + emp.otherAllowances;

      // GOSI calculation
      const gosiEmployee = emp.isSaudi ? emp.basicSalary * 0.10 : emp.basicSalary * 0.01;
      const gosiEmployer  = emp.isSaudi ? emp.basicSalary * 0.12 : emp.basicSalary * 0.02;
      const netSalary = gross - gosiEmployee;

      const line = await this.lineRepo.save({
        tenantId: tenant.tenantId,
        payrollRunId: run.id,
        employeeId: emp.id,
        basicSalary: emp.basicSalary,
        housingAllowance: emp.housingAllowance,
        transportAllowance: emp.transportAllowance,
        otherAllowances: emp.otherAllowances,
        gosiEmployee,
        gosiEmployer,
        netSalary,
      });

      totalBasic       += emp.basicSalary;
      totalAllowances  += emp.housingAllowance + emp.transportAllowance + emp.otherAllowances;
      totalDeductions  += gosiEmployee;
      totalNet         += netSalary;
    }

    await this.runRepo.update(run.id, {
      totalBasic, totalAllowances, totalDeductions, totalNet,
    });

    return this.runRepo.findOne({
      where: { id: run.id },
      relations: ['lines', 'lines.employee'],
    });
  }

  /** Export WPS SIF (Salary Information File) */
  async exportSIF(tenantId: string, runId: string): Promise<string> {
    const run = await this.runRepo.findOneOrFail({
      where: { id: runId, tenantId },
      relations: ['lines', 'lines.employee'],
    });

    const tenant = await this.getTenant(tenantId);
    const lines: string[] = [];

    // SIF Header Record (EDR)
    lines.push([
      'EDR',
      tenant.crNumber.padEnd(10),
      run.payrollMonth.replace('-', ''),
      run.lines.length.toString().padStart(6, '0'),
      run.totalNet.toFixed(2).replace('.', '').padStart(15, '0'),
      'SAR',
      new Date().toISOString().split('T')[0].replace(/-/g, ''),
    ].join('|'));

    // Employee Detail Records (EER)
    for (const line of run.lines) {
      const emp = line.employee;
      lines.push([
        'EER',
        emp.nationalId.padEnd(10),
        (emp.iban || '').padEnd(34),
        line.netSalary.toFixed(2).replace('.', '').padStart(15, '0'),
        'SAR',
        (emp.fullNameAr || '').padEnd(50),
        emp.bankName || 'UNKNOWN',
        emp.jobTitleAr || '',
      ].join('|'));
    }

    // SIF Trailer (ETR)
    lines.push([
      'ETR',
      run.lines.length.toString().padStart(6, '0'),
      run.totalNet.toFixed(2).replace('.', '').padStart(15, '0'),
    ].join('|'));

    return lines.join('\r\n');
  }

  private async getTenant(tenantId: string) {
    return { crNumber: '1010000000', nameAr: 'شركة الأملاك' };
  }
}

// ─────────────────────────────────────────────────────────────
// MODULE 9: QUOTATIONS SERVICE (عروض الأسعار)
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/v1/quotations               ← create quote
 * GET  /api/v1/quotations
 * PUT  /api/v1/quotations/:id/send      ← mark as sent
 * PUT  /api/v1/quotations/:id/accept    ← accept → convert to contract
 * GET  /api/v1/quotations/:id/pdf
 */

@Injectable()
export class QuotationService {
  constructor(
    @InjectRepository(Quotation) private quoteRepo: Repository<Quotation>,
    private contractService: ContractsService,
  ) {}

  async create(tenant: TenantContext, dto: CreateQuotationDto) {
    // Calculate totals
    let subtotal = 0;
    const items = dto.items.map((item: any) => {
      const lineTotal = item.qty * item.unitPrice;
      const lineVat = lineTotal * (item.includeVat ? 0.15 : 0);
      subtotal += lineTotal;
      return { ...item, lineTotal, lineVat };
    });
    const vatAmount = items.reduce((s: number, i: any) => s + i.lineVat, 0);
    const discountAmount = subtotal * ((dto.discountPct ?? 0) / 100);

    const quote = await this.quoteRepo.save({
      ...dto,
      tenantId: tenant.tenantId,
      items,
      subtotal,
      vatAmount,
      discountAmount,
      totalAmount: subtotal - discountAmount + vatAmount,
      status: 'draft',
      createdBy: tenant.userId,
    });

    return quote;
  }

  async acceptAndConvert(tenant: TenantContext, quoteId: string) {
    const quote = await this.quoteRepo.findOneOrFail({
      where: { id: quoteId, tenantId: tenant.tenantId },
    });

    // Convert to rental contract
    const contract = await this.contractService.createDraft(tenant, {
      unitId: quote.unitId,
      renterId: quote.clientId,
      startDate: new Date(),
      annualRent: quote.totalAmount,
      paymentFrequency: 'monthly',
    } as any);

    await this.quoteRepo.update(quoteId, {
      status: 'accepted',
      acceptedAt: new Date(),
      convertedTo: contract.id,
    });

    return { quote: { ...quote, status: 'accepted' }, contract };
  }
}

// ─────────────────────────────────────────────────────────────
// INTEGRATION MOCK PAYLOADS (JSON Contracts)
// ─────────────────────────────────────────────────────────────

export const MOCK_ZATCA_PAYLOAD = {
  request: {
    invoiceHash: "NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI4NTkyOTkwOWFiZTI3NTQ5MQ==",
    uuid: "8e6b4e0b-1f4a-4e2d-b3d9-6c99c2d1234a",
    invoice: "PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4K..."
  },
  response: {
    invoiceHash: "NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI4NTkyOTkwOWFiZTI3NTQ5MQ==",
    status: "REPORTED",
    warnings: [],
    errors: [],
    reportingStatus: "REPORTED",
    clearanceStatus: "NOT_APPLICABLE",
    qrSellersResponse: "ARfYtdmE2YrZitmEINmF2YrYr9mK2K...",
  }
};

export const MOCK_IJAR_REQUEST = {
  propertyRegistrationNumber: "3100001234",
  unitNumber: "101",
  landlordNationalId: "1000000001",
  tenantNationalId: "1000000002",
  contractStartDate: "2026-06-01",
  contractEndDate: "2027-05-31",
  annualRentAmount: 60000,
  paymentPeriod: "MONTHLY",
  contractType: "RESIDENTIAL",
  city: "YANBU",
  district: "AL_SHATI",
  agreementOnRentIncrease: false,
  contractLanguage: "AR"
};

export const MOCK_IJAR_RESPONSE = {
  contractId: "IJAR-2026-445566",
  status: "ACTIVE",
  verificationCode: "7F3A",
  contractUrl: "https://ejar.sa/contracts/IJAR-2026-445566",
  smsNotification: "تم توثيق عقد الإيجار رقم IJAR-2026-445566 بنجاح"
};

export const MOCK_NAFATH_INITIATE = {
  transactionId: "txn_9f3a2b1c-4d5e-6f7a-8b9c-0d1e2f3a4b5c",
  randomNumber: 47,
  expiresIn: 120,
  status: "WAITING",
  nafathAppDeepLink: "nafath://auth?txn=txn_9f3a2b1c"
};

export const MOCK_NAJIZ_REQUEST = {
  propertyDeedNumber: "12345678901234",
  contractNumber: "RC-2026-00001",
  lessorNationalId: "1000000001",
  lesseeNationalId: "1000000002",
  leaseStartDate: "2026-06-01",
  leaseEndDate: "2027-05-31",
  monthlyRent: 5000,
  annualRent: 60000,
  propertyType: "RESIDENTIAL",
  city: "YANBU",
  securityDeposit: 5000,
  paymentFrequency: "MONTHLY"
};

export const MOCK_NAJIZ_RESPONSE = {
  najizContractId: "NJZ-2026-00123",
  status: "REGISTERED",
  registrationDate: "2026-06-03",
  documentUrl: "https://najiz.sa/documents/NJZ-2026-00123.pdf",
  courtJurisdiction: "محكمة ينبع الابتدائية"
};

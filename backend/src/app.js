import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { authMiddleware, errorHandler } from './middleware/auth.js';
import authRouter from './routes/auth.js';
import propertiesRouter from './routes/properties.js';
import unitsRouter from './routes/units.js';
import contractsRouter from './routes/contracts.js';
import receiptsRouter from './routes/receipts.js';
import quotationsRouter from './routes/quotations.js';
import employeesRouter from './routes/employees.js';
import operationsRouter from './routes/operations.js';
import utilitiesRouter from './routes/utilities.js';
import purchasesRouter from './routes/purchases.js';
import financeRouter from './routes/finance.js';
import nafathRouter from './routes/nafath.js';
import otpRouter from './routes/otp.js';
import customersRouter from './routes/customers.js';
import ownersRouter from './routes/owners.js';
import accountingRouter from './routes/accounting.js';
import dealsRouter from './routes/deals.js';
import maintenanceRouter from './routes/maintenance.js';
import marketingRouter from './routes/marketing.js';
import zatcaRouter from './routes/zatca.js';
import ejarRouter from './routes/ejar.js';
import rbacRouter from './routes/rbac.js';
import branchesRouter from './routes/branches.js';
import alertsRouter from './routes/alerts.js';
import biRouter from './routes/bi.js';
import falRouter from './routes/fal.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.static(path.join(__dirname, '..', '..', 'src')));

  // API Status (public — must be before auth middleware)
  app.get('/api/status', (req, res) => {
    res.json({
      message: 'Mulak PropTech API v1.0 — Cloud Edition',
      status: 'running',
      uptime: process.uptime(),
      time: new Date().toISOString(),
    });
  });

  // Nafath (public — must be before auth middleware)
  app.use('/api/nafath', nafathRouter);

  // OTP (public — must be before auth middleware)
  app.use('/api/otp', otpRouter);

  // Auth applies to API routes only (static files are public)
  app.use('/api', authMiddleware);

  // Auth routes (public)
  app.use('/api/auth', authRouter);

  // Protected API routes
  app.use('/api/v1/properties', propertiesRouter);
  app.use('/api/v1/units', unitsRouter);
  app.use('/api/v1/contracts', contractsRouter);
  app.use('/api/v1/receipts', receiptsRouter);
  app.use('/api/v1/quotations', quotationsRouter);
  app.use('/api/v1/employees', employeesRouter);
  app.use('/api/v1/operations', operationsRouter);
  app.use('/api/v1/utilities', utilitiesRouter);
  app.use('/api/v1/purchases', purchasesRouter);
  app.use('/api/v1/finance', financeRouter);
  app.use('/api/v1/customers', customersRouter);
  app.use('/api/v1/owners', ownersRouter);
  app.use('/api/v1/accounting', accountingRouter);
  app.use('/api/v1/deals', dealsRouter);
  app.use('/api/v1/maintenance', maintenanceRouter);
  app.use('/api/v1/marketing', marketingRouter);
  app.use('/api/v1/zatca', zatcaRouter);
  app.use('/api/v1/ejar', ejarRouter);
  app.use('/api/v1/rbac', rbacRouter);
  app.use('/api/v1/branches', branchesRouter);
  app.use('/api/v1/alerts', alertsRouter);
  app.use('/api/v1/bi', biRouter);
  app.use('/api/v1/fal', falRouter);

  // SPA fallback — serve index.html for any non-API route
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: true, message: 'Not found' });
    res.sendFile(path.join(__dirname, '..', '..', 'src', 'index.html'));
  });

  // Error handler
  app.use(errorHandler);

  return app;
}

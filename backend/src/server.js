import { createApp } from './app.js';
import { getDb } from './db/database.js';
import './db/seed.js';

const PORT = process.env.PORT || 3000;

// Initialize database on startup
getDb();
console.log('📦 Database initialized');

const app = createApp();

app.listen(PORT, '0.0.0.0', () => {
  const base = `http://localhost:${PORT}`;
  console.log(`
🚀 Mulak PropTech API Server
   URL:        ${base}/
   Status:     ${base}/api/status
   Properties: ${base}/api/v1/properties
   Contracts:  ${base}/api/v1/contracts
   Receipts:   ${base}/api/v1/receipts
   Employees:  ${base}/api/v1/employees
   Utilities:  ${base}/api/v1/utilities
   Purchases:  ${base}/api/v1/purchases
  `);
});

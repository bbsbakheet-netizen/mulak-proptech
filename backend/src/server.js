import { createApp } from './app.js';
import { getDb } from './db/database.js';

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Initialize database on startup
getDb();
console.log('📦 Database initialized');

const app = createApp();

app.listen(PORT, HOST, () => {
  const host = HOST === '0.0.0.0' ? 'localhost' : HOST;
  const base = `http://${host}:${PORT}`;
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

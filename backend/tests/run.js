/**
 * TestSprite Launcher — sets env vars before loading tests
 */
import { unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DB_PATH = join(__dirname, 'test-temp.db');

// Must be set before any module imports
process.env.DB_PATH = TEST_DB_PATH;

// Clean up old test db
try { unlinkSync(TEST_DB_PATH); } catch (_) {}
try { unlinkSync(TEST_DB_PATH + '-wal'); } catch (_) {}
try { unlinkSync(TEST_DB_PATH + '-shm'); } catch (_) {}

// Now import and run the test suite
await import('./testsprite-core.js');

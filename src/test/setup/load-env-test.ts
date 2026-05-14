/**
 * Side-effect module: must be the first import in integration-only helpers.
 * Loads `.env.test` with override before Prisma / Nest modules read DATABASE_URL.
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({
  path: path.resolve(process.cwd(), '.env.test'),
  override: true,
});

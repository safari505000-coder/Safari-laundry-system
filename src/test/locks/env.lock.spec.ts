import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..', '..', '..');
const srcRoot = join(repoRoot, 'src');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else if (
      entry.endsWith('.ts') &&
      !entry.endsWith('.spec.ts') &&
      !entry.endsWith('.test.ts')
    )
      out.push(full);
  }
  return out;
}

function readEnvExampleKeys(): Set<string> {
  const text = readFileSync(join(repoRoot, '.env.example'), 'utf8');
  const keys = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().startsWith('#')
      ? raw.trim().slice(1).trim()
      : raw.trim();
    const m = line.match(/^([A-Z0-9_]+)\s*=/);
    if (m) keys.add(m[1]);
  }
  return keys;
}

describe('Environment lock', () => {
  const criticalEnv = [
    'DATABASE_URL',
    'JWT_SECRET',
    'PUBLIC_API_URL',
    'PUBLIC_WEB_APP_URL',
    'PAYMENTS_CALLBACK_PUBLIC_URL',
    'PAYMENT_LINK_IMMEDIATE_DEBT',
    'V20_4_FINAL_LEDGER',
    'V20_3_TRUE_ACCOUNTING',
    'USE_JOURNAL_AS_SOURCE',
    'BCRYPT_WORKERS',
    'OPERATING_HOURS_LOCK_ENABLED',
  ] as const;

  it('documents all critical production env vars in .env.example', () => {
    const example = readEnvExampleKeys();
    expect(criticalEnv.filter((key) => !example.has(key))).toEqual([]);
  });

  it('keeps critical boolean feature flags parsing true-like values explicitly', () => {
    const files = walk(srcRoot)
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    for (const flag of [
      'PAYMENT_LINK_IMMEDIATE_DEBT',
      'V20_4_FINAL_LEDGER',
      'V20_3_TRUE_ACCOUNTING',
      'USE_JOURNAL_AS_SOURCE',
    ]) {
      expect(files).toContain(`process.env.${flag}`);
    }
    expect(files).toContain(
      "v === 'true' || v === '1' || v === 'on' || v === 'yes'",
    );
  });

  it('fails if PAYMENTS_MOCK is enabled in production env', () => {
    const nodeEnv = process.env.NODE_ENV;
    const paymentsMock = (process.env.PAYMENTS_MOCK ?? '').trim().toLowerCase();
    expect(
      !(
        nodeEnv === 'production' &&
        ['true', '1', 'on', 'yes'].includes(paymentsMock)
      ),
    ).toBe(true);
  });
});

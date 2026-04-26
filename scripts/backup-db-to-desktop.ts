/**
 * Full DB backup (pg_dump custom format) to the current user's Desktop.
 * Uses Docker postgres:18 image when local pg_dump is older than the server
 * (avoids "server version mismatch" against Railway PG 18).
 *
 *   npx tsx scripts/backup-db-to-desktop.ts
 *
 * Requires: Docker, DATABASE_URL in .env
 */
import 'dotenv/config';
import { execFileSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function desktopDir(): string {
  const home = os.homedir();
  const win = path.join(home, 'Desktop');
  const oneDrive = path.join(home, 'OneDrive', 'Desktop');
  if (fs.existsSync(win)) return win;
  if (fs.existsSync(oneDrive)) return oneDrive;
  return win;
}

function pgDumpCandidates(): string[] {
  const out: string[] = [];
  if (process.platform === 'win32') {
    for (const v of ['18', '17', '16']) {
      out.push(path.join('C:', 'Program Files', 'PostgreSQL', v, 'bin', 'pg_dump.exe'));
    }
  }
  out.push('pg_dump');
  return out;
}

function tryLocalPgDump(url: string, outFile: string): boolean {
  for (const bin of pgDumpCandidates()) {
    if (bin !== 'pg_dump' && !fs.existsSync(bin)) continue;
    try {
      execFileSync(bin, [url, '-Fc', '-f', outFile], { stdio: 'inherit' });
      return true;
    } catch {
      /* try next binary (e.g. v17 vs PG18 server) */
    }
  }
  return false;
}

function dockerPgDump18(url: string, outFile: string): void {
  const desktop = desktopDir();
  const base = path.basename(outFile);
  const r = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '-e',
      `DATABASE_URL=${url}`,
      '-v',
      `${desktop}:/backup`,
      'postgres:18-alpine',
      'sh',
      '-c',
      `pg_dump "$DATABASE_URL" -Fc -f /backup/${base}`,
    ],
    { stdio: 'inherit', shell: false },
  );
  if (r.status !== 0) {
    throw new Error('docker pg_dump failed');
  }
}

function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is missing. Set it in .env');
    process.exit(1);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outFile = path.join(desktopDir(), `safari-erp-backup-${stamp}.dump`);

  console.log('Backup target:', outFile);

  if (tryLocalPgDump(url, outFile)) {
    console.log('Done (local pg_dump).');
    return;
  }

  console.log('Local pg_dump failed (or version mismatch). Trying Docker postgres:18…');
  dockerPgDump18(url, outFile);
  console.log('Done (Docker pg_dump 18).');
}

main();

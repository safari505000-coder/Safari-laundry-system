#!/usr/bin/env tsx
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const ROOT = (0, node_path_1.resolve)(__dirname, '..');
const SCHEMA = (0, node_path_1.resolve)(ROOT, 'prisma', 'schema.prisma');
const MIGRATIONS = (0, node_path_1.resolve)(ROOT, 'prisma', 'migrations');
function fail(msg, code = 1) {
    console.error(`\n[migration-drift] ${msg}\n`);
    process.exit(code);
}
if (!(0, node_fs_1.existsSync)(SCHEMA)) {
    fail(`schema.prisma not found at ${SCHEMA}`);
}
if (!(0, node_fs_1.existsSync)(MIGRATIONS)) {
    fail(`migrations directory not found at ${MIGRATIONS}`);
}
const cmd = [
    'npx prisma migrate diff',
    `--from-migrations "${MIGRATIONS}"`,
    `--to-schema-datamodel "${SCHEMA}"`,
    '--shadow-database-url "$SHADOW_DATABASE_URL"',
    '--exit-code',
].join(' ');
try {
    (0, node_child_process_1.execSync)(cmd, { stdio: 'inherit', shell: 'bash' });
    console.log('[migration-drift] OK — no drift.');
    process.exit(0);
}
catch (err) {
    const status = err.status ?? 1;
    if (status === 2) {
        fail('DRIFT DETECTED. Run `npx prisma migrate dev --name <desc>` to create a migration.', 2);
    }
    fail(`prisma migrate diff failed (exit ${status}). Check your SHADOW_DATABASE_URL / DATABASE_URL env vars.`, 1);
}
//# sourceMappingURL=check-migration-drift.js.map
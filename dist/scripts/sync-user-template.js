"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const adapter_pg_1 = require("@prisma/adapter-pg");
const client_1 = require("@prisma/client");
const pg_1 = require("pg");
function parseArgs(argv) {
    const out = { apply: false };
    for (let i = 2; i < argv.length; i += 1) {
        const a = argv[i];
        if (a === '--template' && argv[i + 1]) {
            out.template = argv[++i];
        }
        else if (a === '--target' && argv[i + 1]) {
            out.target = argv[++i];
        }
        else if (a === '--apply') {
            out.apply = true;
        }
    }
    if (!out.template || !out.target) {
        console.error('Usage: npx tsx scripts/sync-user-template.ts --template <username> --target <username> [--apply]');
        process.exit(2);
    }
    if (out.template === out.target) {
        console.error('--template and --target must be different usernames.');
        process.exit(2);
    }
    return out;
}
async function main() {
    const { template, target, apply } = parseArgs(process.argv);
    if (!process.env.DATABASE_URL) {
        console.error('[sync-user-template] DATABASE_URL is not set. Refusing to run to avoid accidental cross-environment writes.');
        process.exit(1);
    }
    const pool = new pg_1.Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new adapter_pg_1.PrismaPg(pool);
    const prisma = new client_1.PrismaClient({ adapter });
    try {
        const [src, dst] = await Promise.all([
            prisma.user.findUnique({
                where: { username: template },
                select: {
                    id: true,
                    username: true,
                    fullName: true,
                    safariRole: true,
                    roleId: true,
                    branchId: true,
                    isActive: true,
                    jobTitle: true,
                    vehicleLabel: true,
                    role: { select: { name: true } },
                    branch: { select: { name: true } },
                },
            }),
            prisma.user.findUnique({
                where: { username: target },
                select: {
                    id: true,
                    username: true,
                    fullName: true,
                    safariRole: true,
                    roleId: true,
                    branchId: true,
                    isActive: true,
                    jobTitle: true,
                    vehicleLabel: true,
                    role: { select: { name: true } },
                    branch: { select: { name: true } },
                },
            }),
        ]);
        if (!src) {
            console.error(`[sync-user-template] template user not found: ${template}`);
            process.exit(3);
        }
        if (!dst) {
            console.error(`[sync-user-template] target user not found: ${target}`);
            process.exit(3);
        }
        if (src.safariRole === 'OWNER' || dst.safariRole === 'OWNER') {
            console.error('[sync-user-template] Refusing to touch an OWNER account. Abort.');
            process.exit(4);
        }
        const diff = [];
        if (src.safariRole !== dst.safariRole)
            diff.push({ field: 'safariRole', from: dst.safariRole, to: src.safariRole });
        if (src.roleId !== dst.roleId)
            diff.push({
                field: 'roleId',
                from: `${dst.roleId} (${dst.role?.name ?? '?'})`,
                to: `${src.roleId} (${src.role?.name ?? '?'})`,
            });
        if (src.branchId !== dst.branchId)
            diff.push({
                field: 'branchId',
                from: `${dst.branchId ?? 'null'} (${dst.branch?.name ?? '—'})`,
                to: `${src.branchId ?? 'null'} (${src.branch?.name ?? '—'})`,
            });
        if (src.isActive !== dst.isActive)
            diff.push({ field: 'isActive', from: dst.isActive, to: src.isActive });
        if ((src.jobTitle ?? null) !== (dst.jobTitle ?? null))
            diff.push({ field: 'jobTitle', from: dst.jobTitle, to: src.jobTitle });
        if ((src.vehicleLabel ?? null) !== (dst.vehicleLabel ?? null))
            diff.push({
                field: 'vehicleLabel',
                from: dst.vehicleLabel,
                to: src.vehicleLabel,
            });
        console.log('=== V19.2 Sync-User-Template ===');
        console.log(`Template : ${src.username}  (${src.fullName})  safariRole=${src.safariRole}  branch=${src.branch?.name ?? '—'}  active=${src.isActive}`);
        console.log(`Target   : ${dst.username}  (${dst.fullName})  safariRole=${dst.safariRole}  branch=${dst.branch?.name ?? '—'}  active=${dst.isActive}`);
        console.log('');
        if (diff.length === 0) {
            console.log('No diff — target already matches template. Nothing to do.');
            return;
        }
        console.log('Proposed changes on target:');
        for (const d of diff) {
            console.log(`  ${d.field}: ${String(d.from)}  →  ${String(d.to)}`);
        }
        if (!apply) {
            console.log('\n[dry-run] Pass --apply to write these changes.');
            return;
        }
        await prisma.user.update({
            where: { id: dst.id },
            data: {
                safariRole: src.safariRole,
                role: { connect: { id: src.roleId } },
                branch: src.branchId
                    ? { connect: { id: src.branchId } }
                    : { disconnect: true },
                isActive: src.isActive,
                jobTitle: src.jobTitle,
                vehicleLabel: src.vehicleLabel,
            },
        });
        console.log('\nApplied. Target user is now hard-synced to the template.');
    }
    finally {
        await prisma.$disconnect();
        await pool.end();
    }
}
void main().catch((e) => {
    console.error('[sync-user-template] fatal:', e);
    process.exit(1);
});
//# sourceMappingURL=sync-user-template.js.map
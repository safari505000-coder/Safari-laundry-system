"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const adapter_pg_1 = require("@prisma/adapter-pg");
const bcrypt = __importStar(require("bcrypt"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const pg_1 = require("pg");
const client_1 = require("@prisma/client");
const DRIVER_COUNT = 1000;
const CUSTOMER_COUNT = 200;
const PASSWORD_PLAIN = 'Pass1234!';
const connectionString = process.env.DATABASE_URL;
if (!connectionString)
    throw new Error('DATABASE_URL is not set');
const pool = new pg_1.Pool({ connectionString });
const adapter = new adapter_pg_1.PrismaPg(pool);
const prisma = new client_1.PrismaClient({ adapter });
async function main() {
    const t0 = Date.now();
    const managerRole = await prisma.role.findUniqueOrThrow({
        where: { name: client_1.SafariRole.MANAGER },
    });
    const driverRole = await prisma.role.findUniqueOrThrow({
        where: { name: client_1.SafariRole.DRIVER },
    });
    const branch = await prisma.branch.upsert({
        where: { id: '00000000-0000-0000-0000-000000000001' },
        create: {
            id: '00000000-0000-0000-0000-000000000001',
            name: 'loadtest-branch',
            location: 'Kuwait City',
            isActive: true,
        },
        update: { isActive: true },
    });
    const passwordHash = await bcrypt.hash(PASSWORD_PLAIN, 6);
    await prisma.user.upsert({
        where: { username: 'lt-manager' },
        create: {
            username: 'lt-manager',
            password: passwordHash,
            fullName: 'Load-test Manager',
            safariRole: client_1.SafariRole.MANAGER,
            roleId: managerRole.id,
            branchId: branch.id,
            isActive: true,
        },
        update: { password: passwordHash, isActive: true, branchId: branch.id },
    });
    console.info(`Seeding ${DRIVER_COUNT} drivers…`);
    const drivers = [];
    const batchSize = 100;
    for (let batchStart = 0; batchStart < DRIVER_COUNT; batchStart += batchSize) {
        await prisma.$transaction(Array.from({ length: Math.min(batchSize, DRIVER_COUNT - batchStart) }).map((_, i) => {
            const idx = batchStart + i + 1;
            const username = `lt-driver-${String(idx).padStart(4, '0')}`;
            const prefix = `LT${String(idx).padStart(4, '0')}`;
            return prisma.user.upsert({
                where: { username },
                create: {
                    username,
                    password: passwordHash,
                    fullName: `Load-test Driver ${idx}`,
                    safariRole: client_1.SafariRole.DRIVER,
                    roleId: driverRole.id,
                    branchId: branch.id,
                    driverPrefix: prefix,
                    isActive: true,
                },
                update: { password: passwordHash, isActive: true },
            });
        }));
        if (batchStart % 500 === 0) {
            process.stdout.write(`  ${batchStart + batchSize}/${DRIVER_COUNT}\r`);
        }
    }
    const driverRows = await prisma.user.findMany({
        where: { username: { startsWith: 'lt-driver-' } },
        select: { id: true, username: true },
        orderBy: { username: 'asc' },
    });
    drivers.push(...driverRows);
    console.info(`\nSeeding ${CUSTOMER_COUNT} customers…`);
    const customers = [];
    await prisma.customer.deleteMany({
        where: { displayName: { startsWith: 'lt-customer-' } },
    });
    for (let i = 0; i < CUSTOMER_COUNT; i++) {
        const phone = `5${String(5000000 + i).padStart(7, '0')}`.slice(0, 8);
        const c = await prisma.customer.create({
            data: {
                phone,
                displayName: `lt-customer-${i + 1}`,
                address: 'Kuwait City',
                originBranchId: branch.id,
            },
        });
        customers.push({ id: c.id, phone });
    }
    const fixturesPath = path.resolve(__dirname, '..', 'fixtures.json');
    fs.writeFileSync(fixturesPath, JSON.stringify({
        branchId: branch.id,
        manager: { username: 'lt-manager', password: PASSWORD_PLAIN },
        drivers: drivers.map((d) => ({
            username: d.username,
            password: PASSWORD_PLAIN,
            id: d.id,
        })),
        customers,
    }, null, 2));
    console.info(`Seed OK in ${(Date.now() - t0) / 1000}s → ${fixturesPath}\n` +
        `  branch:    ${branch.id}\n` +
        `  manager:   lt-manager / ${PASSWORD_PLAIN}\n` +
        `  drivers:   ${drivers.length}\n` +
        `  customers: ${customers.length}`);
}
main()
    .then(async () => {
    await prisma.$disconnect();
    await pool.end();
})
    .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
});
//# sourceMappingURL=seed-loadtest.js.map
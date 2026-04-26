/**
 * Staff seeder from the owner's canonical roster (branch × names).
 *
 *  • For each name:
 *      1. Try to find an existing `User` by fuzzy fullName match.
 *      2. If found, re-tag `User.branchId` AND `Payroll.branchId` (so monthly
 *         summary groups consistently — see
 *         `scripts/assign-staff-branches-from-roster.ts` for the rationale).
 *      3. If not found, create a new `User`:
 *           – safariRole  → DRIVER when name contains "(سائق)", WORKER otherwise
 *           – username    → auto-generated "emp-<6-hex>" (unique)
 *           – password    → random 32-hex, bcrypt-hashed, locked
 *           – isActive    → true (must be true to show up in مسير الرواتب)
 *           – branchId    → from roster section
 *
 *   npx tsx scripts/seed-staff-from-roster.ts --dry-run
 *   npx tsx scripts/seed-staff-from-roster.ts
 *
 * Re-runs are idempotent: previously-created employees are matched exactly,
 * so branch updates overwrite but no duplicate `User` is created.
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, SafariRole } from '@prisma/client';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString?.trim()) {
  throw new Error('DATABASE_URL is not set');
}
const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const DRY = process.argv.includes('--dry-run');

const BRANCH_MATCHERS: Record<string, (name: string) => boolean> = {
  'سفاري الفروانية': (n) => n.includes('الفروانية'),
  'سفاري المسيلة': (n) => n.includes('مسيل'),
  'سفاري الرقمي': (n) => n.includes('الرقعي') || n.includes('الرقمي'),
  'سفاري الجهراء': (n) => n.includes('الجهراء'),
  المكتب: (n) => n.trim() === 'المكتب',
  خارجي: (n) => n.trim() === 'خارجي' || n.includes('خارجي'),
};

const ROSTER: Record<string, string[]> = {
  'سفاري الفروانية': [
    'علی أحمد نواز',
    'بارسان أوتار',
    'شاهد ممتاذ الدین',
    'عبد الرشيد عبد الجبار',
    'رانجیش (سائق هندي)',
    'شجین (سائق هندي جديد)',
    'ساها علم سراج خان',
    'مصطفى السوداني (الجهراء)',
    'دین محمد اشومياه',
    'مودهي مياه',
    'بوددی لال رام کیشور',
    'شمس الإسلام عبد الجبار',
    'محمد راسیل',
    'كمال کاشور',
  ],
  'سفاري المسيلة': [
    'باببو ريدال اخوكمال',
    'سوباش ناریش',
    'راج بال',
    'بابو لال دهاوکال',
    'سانتوش كومار راج كومار',
    'ابو الكلام صمد على',
    'جامینور علي',
    'ام شومان ام دي میزنور رحمن',
    'سید جاهير الإسلام',
    'عرفات حمادة عبدالواحد',
    'محمد لیتون بيباری',
    'بوجلو (غسال نقداً)',
    'عامل هندي جديد',
    'صاهوود (سائق هندي)',
    'اشرف (مصري غسال)',
    'شاديل (سائق هندي)',
    'توبون شاندر موندول',
    'رینكو لال (غسال)',
    'محمد علي',
  ],
  'سفاري الرقمي': [
    'أنور حسین مياه',
    'محمد دولال سید احمد',
    'اشیش كومار (غسال)',
    'سوخفیر شيدو',
    'محمد سمير الدین',
    'فتحي ابوشامة',
    'نور الامین ابوالخير',
    'محبوب الرحمن عبد علی فضل',
    'منير ايم دي يوسف ملا',
    'رستم مياة أبو مياة',
    'شهاب الدين مانشي عبد القادر',
    'محمد حوسینار بلاشات',
    'محمد کیقي فیتیل مدلاش',
    'سید (مصري غسال)',
    'شبین (سائق هندي)',
    'جنشو (سائق هندي)',
    'ابي شاد (سائق هندي)',
    'راکیش نانھو',
    'راجو رامبال',
    'كاملیش راميش',
  ],
  'سفاري الجهراء': [
    'ابو الحسين عبد الملك',
    'امدی سانوار امدی لیکات',
    'ارجون رام بالاك',
    'أشرف کزهفتیل',
    'محمد حسين (سائق)',
    'شندارا براكاش (سائق)',
    'رام بیلاس ديلار',
    'راج كومار کوشیر',
    'شهيد احمد',
    'شمشیر كومار غترة',
    'فینود كومار (غسيل)',
    'رام شنكر روات',
    'شغي العلم یوسف مولاه',
    'توریاكول حسن (سائق)',
    'ام دی دولات ایوب',
    'كومار بخار',
    'جعفر (سائق)',
    'ابن علي اوتي (نقداً)',
    'باکو مياه',
    'نتین كومار بخار',
    'دیبیش کوار',
  ],
  المكتب: [
    'جواهر مطلق سعود',
    'احمد (المحاسب)',
    'سها عبدالرحمن عبدالله امام',
    'وهاب السلطان',
    'تامر دسوقي',
    'عبدالرحمن (مصمم)',
    'مدام اماني',
    'مدام زينب',
    'مدام ندی',
    'مدام نجوى',
    'مدام ايمان',
    'حفيظ (مكتب)',
  ],
  خارجي: [
    'محمد اكبر',
    'سعيد سليمان',
    'محمد یوسف محمد',
    'حسن علی یتیم',
    'عبدالله القداحي',
    'محمد أرشد إدريس',
    'احمد راشد',
    'فیتیل بوتلاتي',
    'راتيش نارایانان',
    'هاریش',
    'افسال',
    'محمد کایفي',
    'انس موسى الدرواشة',
    'نصیر بهاتي',
    'عائشة السلطان',
    'محسن نصیر احمد',
    'طاهر محمود بشير',
  ],
};

function normName(s: string): string {
  return s
    .replace(/^\s*•\s*/u, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Unify Arabic letter variants so "علی" ↔ "علي" and diacritics don't block matches. */
function arabicFold(s: string): string {
  return s
    .replace(/[\u064B-\u0652\u0670]/g, '')
    .replace(/\u0640/g, '')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/[ىی]/g, 'ي')
    .replace(/ک/g, 'ك')
    .replace(/ة/g, 'ه');
}

function norm(s: string): string {
  return arabicFold(s.normalize('NFKC'))
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function stripNotes(s: string): string {
  return norm(s.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim());
}

function tokens(s: string): string[] {
  return stripNotes(s).split(/\s+/).filter(Boolean);
}

/** Equal after Arabic-note stripping (handles «احمد (المحاسب)» ↔ «احمد»). */
function exactEqual(dbFullName: string, canonical: string): boolean {
  return stripNotes(dbFullName) === stripNotes(canonical);
}

/**
 * Loose prefix match on whitespace-separated tokens. Accepts:
 *   DB «وهاب»             ↔ «وهاب السلطان»
 *   DB «تامر»             ↔ «تامر دسوقي»
 * Rejects very common single-token collisions:
 *   DB «علي»   (< 5 chars) ↔ «علی أحمد نواز»  — skipped
 */
function prefixTokenMatch(dbFullName: string, canonical: string): boolean {
  const db = tokens(dbFullName);
  const can = tokens(canonical);
  if (db.length === 0 || can.length === 0) return false;
  const [short, long] = db.length <= can.length ? [db, can] : [can, db];
  for (let i = 0; i < short.length; i += 1) {
    if (short[i] !== long[i]) return false;
  }
  if (short.length >= 2) return true;
  // Allow 3-char single-token DB names («علي», «سها») to match longer
  // roster entries. If that DB row is duplicated (e.g., two «سها»),
  // both match → logged as ambiguous and skipped instead of silently
  // picking one.
  return short[0]!.length >= 3;
}

/** Driver vs worker hint based on the Arabic tag in parens. */
function inferRole(canonicalName: string): SafariRole {
  const hay = canonicalName.normalize('NFKC');
  return /سائق|شوفير|مندوب/u.test(hay)
    ? SafariRole.DRIVER
    : SafariRole.WORKER;
}

async function uniqueUsername(prefix = 'emp'): Promise<string> {
  // 6 hex chars → 16M space; re-try on the (extremely unlikely) collision.
  for (let i = 0; i < 8; i += 1) {
    const slug = randomBytes(3).toString('hex');
    const candidate = `${prefix}-${slug}`;
    const taken = await prisma.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  throw new Error('Failed to generate unique username after 8 attempts');
}

async function resolveRoleId(role: SafariRole): Promise<string> {
  const row = await prisma.role.findUnique({ where: { name: role } });
  if (!row) {
    throw new Error(
      `Role ${role} missing — run \`prisma db seed\` first to create role/permission baseline.`,
    );
  }
  return row.id;
}

async function main() {
  const branches = await prisma.branch.findMany({
    select: { id: true, name: true },
  });
  const allUsers = await prisma.user.findMany({
    select: { id: true, fullName: true, branchId: true },
  });

  const [workerRoleId, driverRoleId] = await Promise.all([
    resolveRoleId(SafariRole.WORKER),
    resolveRoleId(SafariRole.DRIVER),
  ]);

  const sectionBranchId = new Map<string, string>();
  for (const section of Object.keys(ROSTER)) {
    const pred = BRANCH_MATCHERS[section];
    if (!pred) continue;
    const hits = branches.filter((b) => pred(b.name));
    if (hits.length === 0) {
      console.error(
        `[!] No branch matches section «${section}». DB: ${branches.map((b) => b.name).join(' | ')}`,
      );
      continue;
    }
    hits.sort((a, b) => a.name.length - b.name.length);
    sectionBranchId.set(section, hits[0]!.id);
  }

  let created = 0;
  let updated = 0;
  let payrollRetagged = 0;
  const ambiguous: string[] = [];
  const claimed = new Set<string>();
  const assignments = new Map<string, { userId: string; fullName: string }>();

  /** Two passes so a DB row can't be claimed by multiple roster lines. */
  async function resolveMatches() {
    const items: { section: string; canonical: string; key: string }[] = [];
    for (const [section, rawNames] of Object.entries(ROSTER)) {
      for (const raw of rawNames) {
        const canonical = normName(raw);
        if (!canonical) continue;
        items.push({ section, canonical, key: `${section}|${canonical}` });
      }
    }
    const runPass = (
      predicate: (db: string, canon: string) => boolean,
    ): void => {
      for (const it of items) {
        if (assignments.has(it.key)) continue;
        const hits = allUsers.filter(
          (u) => !claimed.has(u.id) && predicate(u.fullName, it.canonical),
        );
        if (hits.length === 0) continue;
        if (hits.length > 1) {
          hits.sort((a, b) => a.id.localeCompare(b.id));
          ambiguous.push(
            `${it.section} ← «${it.canonical}» (${hits.length}: ${hits.map((h) => h.fullName).join(' | ')})`,
          );
          continue;
        }
        const u = hits[0]!;
        claimed.add(u.id);
        assignments.set(it.key, { userId: u.id, fullName: u.fullName });
      }
    };
    runPass(exactEqual);
    runPass(prefixTokenMatch);
    return items;
  }

  const items = await resolveMatches();

  async function lockedHash(): Promise<string> {
    const secret = randomBytes(16).toString('hex');
    return bcrypt.hash(secret, 12);
  }

  for (const it of items) {
    const branchId = sectionBranchId.get(it.section);
    if (!branchId) continue;

    const match = assignments.get(it.key);
    if (match) {
      const u = allUsers.find((x) => x.id === match.userId)!;
      if (u.branchId === branchId) continue;
      if (DRY) {
        const pCount = await prisma.payroll.count({
          where: { userId: u.id },
        });
        console.log(
          `[dry-run][move] ${u.fullName} → ${it.section} | Payroll rows: ${pCount}`,
        );
        updated += 1;
        payrollRetagged += pCount;
        continue;
      }
      await prisma.user.update({
        where: { id: u.id },
        data: { branchId },
      });
      const r = await prisma.payroll.updateMany({
        where: { userId: u.id },
        data: { branchId },
      });
      u.branchId = branchId;
      updated += 1;
      payrollRetagged += r.count;
      console.log(
        `[move] ${u.fullName} → ${it.section} | payroll rows updated: ${r.count}`,
      );
      continue;
    }

    // Unmatched → create new User
    const role = inferRole(it.canonical);
    const roleId = role === SafariRole.DRIVER ? driverRoleId : workerRoleId;

    if (DRY) {
      console.log(
        `[dry-run][create] ${it.canonical}  role=${role}  branch=${it.section}`,
      );
      created += 1;
      continue;
    }

    const username = await uniqueUsername();
    const password = await lockedHash();
    const newUser = await prisma.user.create({
      data: {
        fullName: it.canonical,
        username,
        password,
        safariRole: role,
        roleId,
        branchId,
        isActive: true,
      },
      select: { id: true, fullName: true },
    });
    allUsers.push({
      id: newUser.id,
      fullName: newUser.fullName,
      branchId,
    });
    claimed.add(newUser.id);
    created += 1;
    console.log(
      `[create] ${newUser.fullName}  role=${role}  branch=${it.section}  user=${username}`,
    );
  }

  console.log('');
  if (DRY) {
    console.log(
      `Dry-run — create: ${created}, re-assign: ${updated}, payroll retag: ${payrollRetagged}.`,
    );
  } else {
    console.log(`Created users:          ${created}`);
    console.log(`Re-assigned to branch:  ${updated}`);
    console.log(`Payroll rows retagged:  ${payrollRetagged}`);
  }
  if (ambiguous.length) {
    console.log('\n--- SKIPPED: multiple users with same fullName ---');
    for (const a of ambiguous) console.log(a);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

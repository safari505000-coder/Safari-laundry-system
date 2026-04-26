/**
 * V19.26 — One-shot: set Branch.payrollRosterSortOrder + User.payrollRosterLineOrder
 * from the owner’s canonical مسير list (branch blocks + name order).
 *
 * Run (from repo root, DATABASE_URL set):
 *   npx tsx scripts/apply-payroll-roster-order.ts
 *   npx tsx scripts/apply-payroll-roster-order.ts --dry-run
 *
 * Branch match: branch.name must include the Arabic «needle» (e.g. فروانية).
 * Employee match: fuzzy on fullName within that branch (NFKC + parentheses stripped).
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString?.trim()) {
  throw new Error('DATABASE_URL is not set');
}
const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const DRY = process.argv.includes('--dry-run');

/** Lower needle appears first on roster. Order: 1..N */
const BLOCKS: { branchNeedle: string; sortOrder: number; employees: string[] }[] =
  [
    {
      branchNeedle: 'فروانية',
      sortOrder: 1,
      employees: [
        'علی أحمد نواز',
        'بارسان أوتار',
        'شاهد ممتاذ الدین',
        'عبد الرشيد عبد الجبار',
        'رانجیش (سائق هندي)',
        'شجین (سائق هندي جديد)',
        'ساها علم سراج خان',
        'مصطفى السوداني (الجهراء)',
        'دین محمد اشومیاه',
        'مودهي مياه',
        'بوددی لال رام کیشور',
        'شمس الإسلام عبد الجبار',
        'محمد راسیل',
        'كمال کاشور',
      ],
    },
    {
      branchNeedle: 'مسيلة',
      sortOrder: 2,
      employees: [
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
    },
    {
      branchNeedle: 'رقمي',
      sortOrder: 3,
      employees: [
        'أنور حسین مياه',
        'محمد دولال سيد احمد',
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
        'كامليش راميش',
      ],
    },
    {
      branchNeedle: 'جهراء',
      sortOrder: 4,
      employees: [
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
    },
    {
      branchNeedle: 'مكتب الإدارة',
      sortOrder: 5,
      employees: [
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
    },
    {
      branchNeedle: 'خارجي',
      sortOrder: 6,
      employees: [
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
        'محمد کایفی',
        'انس موسى الدرواشة',
        'نصیر بهاتي',
        'عائشة السلطان',
        'محسن نصیر احمد',
        'طاهر محمود بشير',
      ],
    },
  ];

function norm(s: string): string {
  return s.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function stripNotes(s: string): string {
  return norm(s.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim());
}

function matchEmployeeName(dbFullName: string, canonical: string): boolean {
  const a = norm(dbFullName);
  const b = norm(canonical);
  if (a === b) return true;
  const ac = stripNotes(dbFullName);
  const bc = stripNotes(canonical);
  if (ac === bc) return true;
  if (ac.includes(bc) || bc.includes(ac)) return true;
  return false;
}

function findBranchForNeedle(
  branches: { id: string; name: string }[],
  needle: string,
): { id: string; name: string } | undefined {
  const n = norm(needle);
  const hits = branches.filter((b) => norm(b.name).includes(n));
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) {
    const exact = hits.find((b) => norm(b.name) === n);
    if (exact) return exact;
    hits.sort((a, b) => a.name.length - b.name.length);
    return hits[0];
  }
  return undefined;
}

async function main() {
  const branches = await prisma.branch.findMany({
    select: { id: true, name: true },
  });
  const users = await prisma.user.findMany({
    where: { branchId: { not: null } },
    select: { id: true, fullName: true, branchId: true },
  });

  for (const block of BLOCKS) {
    const br = findBranchForNeedle(branches, block.branchNeedle);
    if (!br) {
      console.warn(
        `[skip] No branch matched needle «${block.branchNeedle}» — create/rename branch or adjust needle.`,
      );
      continue;
    }
    console.info(
      `${DRY ? '[dry-run] ' : ''}Branch «${br.name}» → roster sort ${block.sortOrder}`,
    );
    if (!DRY) {
      await prisma.branch.update({
        where: { id: br.id },
        data: { payrollRosterSortOrder: block.sortOrder },
      });
    }

    const inBranch = users.filter((u) => u.branchId === br.id);
    let ord = 1;
    for (const canonName of block.employees) {
      const candidates = inBranch.filter((u) =>
        matchEmployeeName(u.fullName, canonName),
      );
      if (candidates.length === 0) {
        console.warn(
          `  [miss] «${canonName}» — no user in branch «${br.name}»`,
        );
        continue;
      }
      if (candidates.length > 1) {
        candidates.sort((a, b) => a.id.localeCompare(b.id));
        console.warn(
          `  [ambig] «${canonName}» → ${candidates.length} users; using ${candidates[0]!.fullName}`,
        );
      }
      const u = candidates[0]!;
      console.info(`  ${ord}. ${u.fullName}`);
      if (!DRY) {
        await prisma.user.update({
          where: { id: u.id },
          data: { payrollRosterLineOrder: ord },
        });
      }
      ord += 1;
    }
  }

  console.info(DRY ? 'Dry run complete — no DB writes.' : 'Done.');
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

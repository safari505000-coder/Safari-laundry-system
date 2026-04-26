/**
 * One-off: assign `User.branchId` from an owner-provided roster (Arabic names × branch).
 *
 * Resolves branches by name heuristics (matches «سفاري الرقعي» when the roster
 * says «سفاري الرقمي»). Matches users by `fullName` (trim); logs unresolved rows.
 *
 * **الملخص الشهري:** صفّ `payrollPaidKd` لكل فرع يُحسب من `Payroll.branchId`
 * (`PayrollService.sumPaidNetInRange`), وليس من فرع المستخدم فقط. لذلك بعد
 * تحديث المستخدم نحدّث تلقائياً كل سطور `Payroll` لذلك المستخدم لتطابق الفرع
 * الجديد — وإلا يبقى الراتب تحت فرع قديم ويظهر «تكرار» أو تراكيز خاطئة
 * على أفرع في التقرير.
 *
 *   npx tsx scripts/assign-staff-branches-from-roster.ts --dry-run
 *   npx tsx scripts/assign-staff-branches-from-roster.ts
 *   npx tsx scripts/assign-staff-branches-from-roster.ts --user-only
 *     (يحدّث User فقط ولا يلمس Payroll — غير مُستحسن للملخص الشهري)
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
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const DRY = process.argv.includes('--dry-run');
/** Default: also align `Payroll.branchId` so monthly summary per-branch payroll lines match. */
const USER_ONLY = process.argv.includes('--user-only');

/** Roster headings → predicate on `Branch.name` (DB). */
const BRANCH_MATCHERS: Record<string, (name: string) => boolean> = {
  'سفاري الفروانية': (n) => n.includes('الفروانية'),
  /** DB may use «مسيله» or «المسيلة». */
  'سفاري المسيلة': (n) => n.includes('مسيل'),
  /** Owner wrote «الرقمي»; production branch is usually «الرقعي». */
  'سفاري الرقمي': (n) => n.includes('الرقعي') || n.includes('الرقمي'),
  'سفاري الجهراء': (n) => n.includes('الجهراء'),
  /** Exact «المكتب» only — not «المكتب يوزرات فقط». */
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

function norm(s: string): string {
  return s.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function stripNotes(s: string): string {
  return norm(s.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim());
}

/**
 * Stricter than `apply-payroll-roster-order.ts` (which only searches inside one branch).
 * Substring / includes is allowed only when both sides are long enough to avoid
 * linking «احمد» to «محمد … احمد» by accident.
 */
const MIN_SUBSTRING_LEN = 14;

function matchEmployeeName(dbFullName: string, canonical: string): boolean {
  const a = norm(dbFullName);
  const b = norm(canonical);
  if (a === b) return true;
  const ac = stripNotes(dbFullName);
  const bc = stripNotes(canonical);
  if (ac === bc) return true;
  if (
    ac.length >= MIN_SUBSTRING_LEN &&
    bc.length >= MIN_SUBSTRING_LEN &&
    (ac.includes(bc) || bc.includes(ac))
  ) {
    return true;
  }
  return false;
}

function resolveBranchId(
  branches: { id: string; name: string }[],
  section: string,
): string | null {
  const pred = BRANCH_MATCHERS[section];
  if (!pred) {
    console.error(`No matcher for section: ${section}`);
    return null;
  }
  const hits = branches.filter((b) => pred(b.name));
  if (hits.length === 0) {
    console.error(
      `No branch matches section «${section}». DB branches: ${branches.map((b) => b.name).join(' | ')}`,
    );
    return null;
  }
  if (hits.length > 1) {
    hits.sort((a, b) => a.name.length - b.name.length);
    console.warn(
      `Ambiguous «${section}»: ${hits.map((h) => h.name).join(', ')} → using «${hits[0].name}»`,
    );
  }
  return hits[0]!.id;
}

async function main() {
  const branches = await prisma.branch.findMany({
    select: { id: true, name: true },
  });
  const allUsers = await prisma.user.findMany({
    select: { id: true, fullName: true, branchId: true },
  });

  const sectionIds = new Map<string, string>();
  for (const section of Object.keys(ROSTER)) {
    const id = resolveBranchId(branches, section);
    if (id) sectionIds.set(section, id);
  }

  let updatedUsers = 0;
  let payrollRowsUpdated = 0;
  const missing: string[] = [];
  const ambiguous: string[] = [];
  const moves: {
    userId: string;
    fullName: string;
    branchId: string;
    section: string;
  }[] = [];

  for (const [section, rawNames] of Object.entries(ROSTER)) {
    const branchId = sectionIds.get(section);
    if (!branchId) continue;

    for (const raw of rawNames) {
      const name = normName(raw);
      if (!name) continue;

      const hits = allUsers.filter((u) => matchEmployeeName(u.fullName, name));

      if (hits.length === 0) {
        missing.push(`${section} ← «${name}»`);
        continue;
      }
      if (hits.length > 1) {
        hits.sort((a, b) => a.id.localeCompare(b.id));
        ambiguous.push(
          `${section} ← «${name}» (${hits.length} users: ${hits.map((u) => u.fullName).join(' | ')})`,
        );
        continue;
      }

      const u = hits[0]!;
      if (u.branchId === branchId) {
        continue;
      }
      moves.push({
        userId: u.id,
        fullName: u.fullName,
        branchId,
        section,
      });
    }
  }

  for (const m of moves) {
    if (DRY) {
      const payrollCount = await prisma.payroll.count({
        where: { userId: m.userId },
      });
      console.log(
        `[dry-run] ${m.fullName} → ${m.section} | User.branchId | Payroll rows: ${payrollCount} would move to this branch`,
      );
      updatedUsers += 1;
      payrollRowsUpdated += payrollCount;
      continue;
    }
    await prisma.user.update({
      where: { id: m.userId },
      data: { branchId: m.branchId },
    });
    if (!USER_ONLY) {
      const r = await prisma.payroll.updateMany({
        where: { userId: m.userId },
        data: { branchId: m.branchId },
      });
      payrollRowsUpdated += r.count;
      console.log(
        `OK ${m.fullName} → ${m.section} | Payroll.branchId rows updated: ${r.count}`,
      );
    } else {
      console.log(`OK ${m.fullName} → ${m.section}`);
    }
    updatedUsers += 1;
  }

  console.log('');
  if (DRY) {
    console.log(
      `Dry-run: ${updatedUsers} users would move; ${payrollRowsUpdated} payroll row(s) would get new branchId.`,
    );
  } else {
    console.log(`Updated users: ${updatedUsers}.`);
    if (!USER_ONLY) {
      console.log(
        `Payroll rows re-tagged to match user branch (for monthly summary): ${payrollRowsUpdated}.`,
      );
    } else {
      console.log('Skipped Payroll.branchId sync (--user-only).');
    }
  }
  if (missing.length) {
    console.log('\n--- not found in DB (check spelling vs User.fullName) ---');
    for (const m of missing) console.log(m);
  }
  if (ambiguous.length) {
    console.log('\n--- multiple users with same fullName (fix manually) ---');
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

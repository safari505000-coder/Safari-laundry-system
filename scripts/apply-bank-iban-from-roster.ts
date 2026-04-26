/**
 * Apply bank account numbers from the owner's roster (branch × name → IBAN/local #).
 * Matches `User.fullName` using the same Arabic fold + two-pass rules as
 * `scripts/seed-staff-from-roster.ts`.
 *
 *   npx tsx scripts/apply-bank-iban-from-roster.ts --dry-run
 *   npx tsx scripts/apply-bank-iban-from-roster.ts
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

/** Logical roster section → same keys as seed-staff-from-roster. */
const BRANCH_MATCHERS: Record<string, (name: string) => boolean> = {
  'سفاري الفروانية': (n) => n.includes('الفروانية'),
  'سفاري المسيلة': (n) => n.includes('مسيل'),
  'سفاري الرقمي': (n) => n.includes('الرقعي') || n.includes('الرقمي'),
  'سفاري الجهراء': (n) => n.includes('الجهراء'),
  المكتب: (n) => n.trim() === 'المكتب',
  خارجي: (n) => n.trim() === 'خارجي' || n.includes('خارجي'),
};

type Entry = { section: string; name: string; iban: string };

const ENTRIES: Entry[] = [
  // فرع الفروانية
  { section: 'سفاري الفروانية', name: 'على أحمد نواز', iban: '3229468028' },
  { section: 'سفاري الفروانية', name: 'بارسان أوتار', iban: '0502442013' },
  { section: 'سفاري الفروانية', name: 'شاهد ممتاذ الدين', iban: '3229484031' },
  { section: 'سفاري الفروانية', name: 'عبد الرشيد عبد الجبار', iban: '3229441045' },
  { section: 'سفاري الفروانية', name: 'ساها علم سراج خان', iban: '0845302029' },
  {
    section: 'سفاري الفروانية',
    name: 'مصطفى السوداني (الجهراء)',
    iban: '1998654012',
  },
  { section: 'سفاري الفروانية', name: 'دین محمد اشومياه', iban: '4816883028' },
  { section: 'سفاري الفروانية', name: 'مودهي مياه', iban: '6907167037' },
  { section: 'سفاري الفروانية', name: 'بوددی لال رام کیشور', iban: '1552021010' },
  { section: 'سفاري الفروانية', name: 'شمس الإسلام عبد الجبار', iban: '6521018020' },
  { section: 'سفاري الفروانية', name: 'محمد راسيل', iban: '6207161037' },
  { section: 'سفاري الفروانية', name: 'کمال کاشور', iban: '0454944029' },
  // فرع المسيلة
  { section: 'سفاري المسيلة', name: 'باببو ريدال اخو كمال', iban: '9990760017' },
  { section: 'سفاري المسيلة', name: 'سوباش ناریش', iban: '9963551015' },
  { section: 'سفاري المسيلة', name: 'راج بال', iban: '6585718020' },
  { section: 'سفاري المسيلة', name: 'بابو لال دهاوكال', iban: '0934634026' },
  {
    section: 'سفاري المسيلة',
    name: 'سانتوش كومار راج كومار',
    iban: '0618251029',
  },
  { section: 'سفاري المسيلة', name: 'ابو الكلام صمد على', iban: '3780401024' },
  { section: 'سفاري المسيلة', name: 'جامينور علي', iban: '0400376014' },
  {
    section: 'سفاري المسيلة',
    name: 'ام شومان ام دي ميزنور رحمن',
    iban: '5004101968',
  },
  { section: 'سفاري المسيلة', name: 'سيد جاهير الإسلام', iban: '3783645054' },
  { section: 'سفاري المسيلة', name: 'عرفات حمادة عبد الواحد', iban: '3229476023' },
  { section: 'سفاري المسيلة', name: 'محمد لیتون بیباری', iban: '0873864042' },
  { section: 'سفاري المسيلة', name: 'توبون شاندر موندول', iban: '0936330011' },
  { section: 'سفاري المسيلة', name: 'رينكو لال', iban: '1701466011' },
  { section: 'سفاري المسيلة', name: 'محمد على', iban: '1354591026' },
  // فرع الرقعي
  { section: 'سفاري الرقمي', name: 'أنور حسين مياه', iban: '0873813022' },
  { section: 'سفاري الرقمي', name: 'محمد دولال سید احمد', iban: '0677162019' },
  { section: 'سفاري الرقمي', name: 'اشيش كومار', iban: '1810956010' },
  { section: 'سفاري الرقمي', name: 'سوخفير شيدو', iban: '0786052010' },
  { section: 'سفاري الرقمي', name: 'محمد سمير الدين', iban: '0630207022' },
  { section: 'سفاري الرقمي', name: 'فتحي ابوشامة', iban: '6207144025' },
  { section: 'سفاري الرقمي', name: 'نور الامين ابو الخير', iban: '0344689018' },
  {
    section: 'سفاري الرقمي',
    name: 'محبوب الرحمن عبد على فضل',
    iban: '845265026',
  },
  { section: 'سفاري الرقمي', name: 'منير ايم دي يوسف ملا', iban: '8276212013' },
  { section: 'سفاري الرقمي', name: 'رستم مياة أبو مياة', iban: '9476427038' },
  {
    section: 'سفاري الرقمي',
    name: 'شهاب الدين مانشي عبد القادر',
    iban: '0845310024',
  },
  { section: 'سفاري الرقمي', name: 'محمد حوسينار بلاشات', iban: '1701458016' },
  { section: 'سفاري الرقمي', name: 'محمد كيقي فيتيل مدلاش', iban: '1701456018' },
  { section: 'سفاري الرقمي', name: 'راكيش نانهو', iban: '0786055017' },
  { section: 'سفاري الرقمي', name: 'راجو را مبال', iban: '1552022019' },
  { section: 'سفاري الرقمي', name: 'کاملیش رامیش', iban: '9942381013' },
  // فرع الجهراء
  { section: 'سفاري الجهراء', name: 'ابو الحسين عبد الملك', iban: '3779769026' },
  { section: 'سفاري الجهراء', name: 'امدی سانوار آمدی لييكات', iban: '0936326012' },
  { section: 'سفاري الجهراء', name: 'ارجون رام بالاك', iban: '1552020011' },
  { section: 'سفاري الجهراء', name: 'أشرف كز هفتيل', iban: '6207136020' },
  { section: 'سفاري الجهراء', name: 'محمد حسين (السائق)', iban: '1877374011' },
  {
    section: 'سفاري الجهراء',
    name: 'شندا را براكاش (السائق)',
    iban: '1877375010',
  },
  { section: 'سفاري الجهراء', name: 'رام بیلاس ديلار', iban: '448682019' },
  { section: 'سفاري الجهراء', name: 'راج کومار كوشير', iban: '9943559011' },
  { section: 'سفاري الجهراء', name: 'شهيد أحمد', iban: '502440015' },
  { section: 'سفاري الجهراء', name: 'شمشير كومار غترة', iban: '1735000012' },
  { section: 'سفاري الجهراء', name: 'فينود كومار غسيل', iban: '1734999013' },
  { section: 'سفاري الجهراء', name: 'رام شنكر روات', iban: '9948478015' },
  { section: 'سفاري الجهراء', name: 'شفي العلم يوسف مولاه', iban: '3783848028' },
  {
    section: 'سفاري الجهراء',
    name: 'تورياكول حسن (السائق)',
    iban: '1895893032',
  },
  { section: 'سفاري الجهراء', name: 'ام دي دولات ايوب', iban: '0486967029' },
  { section: 'سفاري الجهراء', name: 'باكو مياه', iban: '0327686025' },
  { section: 'سفاري الجهراء', name: 'نتين كومار بخار', iban: '9948473010' },
  { section: 'سفاري الجهراء', name: 'دیبیش کوار فيشرام', iban: '1552023018' },
  // مكتب الإدارة
  { section: 'المكتب', name: 'جواهر مطلق سعود', iban: '4302003439' },
  { section: 'المكتب', name: 'احمد المحاسب', iban: '0969193029' },
  {
    section: 'المكتب',
    name: 'سها عبد الرحمن عبدالله امام',
    iban: '9925848015',
  },
  { section: 'المكتب', name: 'وهاب السلطان', iban: '0845329028' },
  // خارجي
  { section: 'خارجي', name: 'محمد اكبر', iban: '0317472014' },
  { section: 'خارجي', name: 'سعيد سليمان', iban: '0353461021' },
  { section: 'خارجي', name: 'محمد يوسف محمد', iban: '6945016026' },
  { section: 'خارجي', name: 'حسن على يتيم', iban: '0602514541' },
  { section: 'خارجي', name: 'عبد الله القداحي', iban: '9874600013' },
  { section: 'خارجي', name: 'محمد أرشد إدريس', iban: '3372256047' },
  { section: 'خارجي', name: 'أحمد راشد تبع حسن', iban: '1846045019' },
  { section: 'خارجي', name: 'فيتيل بوتلاتي', iban: '0405074020' },
  {
    section: 'خارجي',
    name: 'راتيش نارایانان او د انفالابيل',
    iban: '0633622019',
  },
  { section: 'خارجي', name: 'هاريش', iban: '1580956046' },
  { section: 'خارجي', name: 'افسال', iban: '0485433025' },
  { section: 'خارجي', name: 'محمد كايفي', iban: '1520010037' },
  { section: 'خارجي', name: 'انس موسى الدرواشة', iban: '3274747056' },
  { section: 'خارجي', name: 'نصير بهائي', iban: '3781519039' },
  {
    section: 'خارجي',
    name: 'عائشة السلطان (زوجة وهاب)',
    iban: '1773375016',
  },
  { section: 'خارجي', name: 'محسن نصير احمد', iban: '1946978015' },
  { section: 'خارجي', name: 'طاهر محمود بشير', iban: '6945024034' },
];

function normName(s: string): string {
  return s
    .replace(/^\s*•\s*/u, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function arabicFold(s: string): string {
  return s
    .replace(/[\u064B-\u0652\u0670]/g, '')
    .replace(/\u0640/g, '')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/[ىی]/g, 'ي')
    .replace(/ک/g, 'ك')
    .replace(/\u06BE/g, 'ه') // ھ (Urdu/Persian) → ه
    .replace(/\u06C1/g, 'ه')
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

function exactEqual(dbFullName: string, canonical: string): boolean {
  return stripNotes(dbFullName) === stripNotes(canonical);
}

function prefixTokenMatch(dbFullName: string, canonical: string): boolean {
  const db = tokens(dbFullName);
  const can = tokens(canonical);
  if (db.length === 0 || can.length === 0) return false;
  const [short, long] = db.length <= can.length ? [db, can] : [can, db];
  for (let i = 0; i < short.length; i += 1) {
    if (short[i] !== long[i]) return false;
  }
  if (short.length >= 2) return true;
  return short[0]!.length >= 3;
}

/** «عبدالله» vs «عبد الله»، «ابوكمال» vs «ابو كمال»، «شندارا» vs «شندا را». */
function compactKey(s: string): string {
  return stripNotes(s).replace(/\s+/g, '');
}

function compactEqual(dbFullName: string, canonical: string): boolean {
  const a = compactKey(dbFullName);
  const b = compactKey(canonical);
  if (a.length < 4 || b.length < 4) return false;
  return a === b;
}

/** Roster spelling → substring that must appear in DB fullName (after fold). */
const NAME_ALIASES: Record<string, string> = {
  'شفي العلم يوسف مولاه': 'شغي العلم',
  'أشرف كز هفتيل': 'هفتیل',
  'امدی سانوار آمدی لييكات': 'سانوار',
  'شندا را براكاش (السائق)': 'شندارا براكاش',
  'نصير بهائي': 'نصیر بهاتي',
};

function aliasMatch(dbFullName: string, canonical: string): boolean {
  const hint = NAME_ALIASES[canonical];
  if (!hint) return false;
  const db = norm(dbFullName);
  const h = norm(hint);
  return db.includes(h);
}

function normIban(raw: string): string {
  return raw.replace(/\s/g, '').trim();
}

async function main() {
  const branches = await prisma.branch.findMany({
    select: { id: true, name: true },
  });
  const allUsers = await prisma.user.findMany({
    select: { id: true, fullName: true, branchId: true, bankIban: true },
  });

  const sectionBranchId = new Map<string, string>();
  for (const section of [...new Set(ENTRIES.map((e) => e.section))]) {
    const pred = BRANCH_MATCHERS[section];
    if (!pred) {
      console.error(`[!] Unknown section «${section}»`);
      continue;
    }
    const hits = branches.filter((b) => pred(b.name));
    if (hits.length === 0) {
      console.error(
        `[!] No branch for «${section}». DB: ${branches.map((b) => b.name).join(' | ')}`,
      );
      continue;
    }
    hits.sort((a, b) => a.name.length - b.name.length);
    sectionBranchId.set(section, hits[0]!.id);
  }

  const assignments = new Map<string, { userId: string; fullName: string }>();
  const claimed = new Set<string>();
  const ambiguous: string[] = [];
  const notFound: string[] = [];

  const items = ENTRIES.map((e) => ({
    ...e,
    canonical: normName(e.name),
    key: `${e.section}|${normName(e.name)}`,
  }));

  const runPass = (
    predicate: (db: string, canon: string) => boolean,
    requireBranch: boolean,
  ): void => {
    for (const it of items) {
      if (assignments.has(it.key)) continue;
      const expectedBranch = sectionBranchId.get(it.section);
      const hits = allUsers.filter((u) => {
        if (!predicate(u.fullName, it.canonical)) return false;
        if (requireBranch && expectedBranch && u.branchId !== expectedBranch) {
          return false;
        }
        return true;
      });
      const free = hits.filter((u) => !claimed.has(u.id));
      if (free.length === 0) continue;
      if (free.length > 1) {
        free.sort((a, b) => a.id.localeCompare(b.id));
        ambiguous.push(
          `«${it.canonical}» [${it.section}] (${free.length}: ${free.map((h) => h.fullName).join(' | ')})`,
        );
        continue;
      }
      const u = free[0]!;
      claimed.add(u.id);
      assignments.set(it.key, { userId: u.id, fullName: u.fullName });
    }
  };

  runPass(exactEqual, true);
  runPass(prefixTokenMatch, true);
  runPass(compactEqual, true);
  runPass(aliasMatch, true);
  runPass(exactEqual, false);
  runPass(prefixTokenMatch, false);
  runPass(compactEqual, false);
  runPass(aliasMatch, false);

  for (const it of items) {
    if (assignments.has(it.key)) continue;
    const expectedBranch = sectionBranchId.get(it.section);
    const hits = allUsers.filter((u) =>
      exactEqual(u.fullName, it.canonical) ||
      prefixTokenMatch(u.fullName, it.canonical),
    );
    if (hits.length === 0) {
      notFound.push(`${it.section} ← «${it.canonical}»`);
      continue;
    }
    const wrongBranch = hits.filter(
      (u) => expectedBranch && u.branchId !== expectedBranch,
    );
    if (wrongBranch.length && hits.length === wrongBranch.length) {
      notFound.push(
        `${it.section} ← «${it.canonical}» (موجود بفرع آخر: ${wrongBranch.map((u) => u.fullName).join(' | ')})`,
      );
    } else if (hits.length > 1) {
      ambiguous.push(
        `«${it.canonical}» [${it.section}] (${hits.length}: ${hits.map((h) => h.fullName).join(' | ')})`,
      );
    }
  }

  let updated = 0;
  let unchanged = 0;

  for (const it of items) {
    const match = assignments.get(it.key);
    if (!match) continue;
    const iban = normIban(it.iban);
    if (!iban) {
      console.warn(`[skip empty iban] ${match.fullName}`);
      continue;
    }
    const u = allUsers.find((x) => x.id === match.userId)!;
    const prev = (u.bankIban ?? '').replace(/\s/g, '').trim();
    if (prev === iban) {
      unchanged += 1;
      continue;
    }
    if (DRY) {
      console.log(
        `[dry-run] ${u.fullName}  ${prev || '—'} → ${iban}`,
      );
      updated += 1;
      continue;
    }
    await prisma.user.update({
      where: { id: u.id },
      data: { bankIban: iban },
    });
    u.bankIban = iban;
    console.log(`[ok] ${u.fullName}  → ${iban}`);
    updated += 1;
  }

  console.log('');
  console.log(
    DRY
      ? `Dry-run: would update ${updated}, unchanged ${unchanged}, entries ${items.length}.`
      : `Updated ${updated}, unchanged ${unchanged}, roster lines ${items.length}.`,
  );
  if (ambiguous.length) {
    console.log('\n--- تخطّي: أكثر من مستخدم يطابق الاسم / الفرع ---');
    for (const a of ambiguous) console.log(a);
  }
  if (notFound.length) {
    console.log('\n--- لم يُعثر على مستخدم (أو الفرع لا يطابق) ---');
    for (const n of notFound) console.log(n);
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

import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const desktopDir = path.join(
  process.env.USERPROFILE || os.homedir(),
  'Desktop',
);
const outDir = path.join(desktopDir, 'Safari_Full_Accounting_Review');

const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.txt',
  '.sql',
  '.prisma',
  '.yaml',
  '.yml',
  '.env',
]);

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.turbo',
  '.cursor',
  '.idea',
  '.vscode',
  'coverage',
  'tmp',
  'temp',
]);

function toRel(absPath) {
  return path.relative(repoRoot, absPath).split(path.sep).join('/');
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

async function walkAllFiles(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const nested = await walkAllFiles(full);
      out.push(...nested);
      continue;
    }
    if (!entry.isFile()) continue;
    out.push(full);
  }
  return out;
}

function isTextFile(filePath) {
  return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

async function readTextSafe(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

function uniqueSorted(paths) {
  return Array.from(new Set(paths)).sort((a, b) => a.localeCompare(b));
}

function hardcodedAndMathFlags(content) {
  const lines = content.split(/\r?\n/);
  const flags = [];
  const hardcodedRegex = /(^|[^\w])(-?\d+(?:\.\d+)?)(?![\w])/g;
  const mathRegex =
    /\b(reduce|sum|plus|minus|mul|div|toFixed|parseFloat|parseInt|Math\.|Decimal|aggregate|round|ceil|floor|avg|median)\b|(?<![=<>!])\s[+\-*/%]\s/;
  const benignNumericLine = /^\s*(import|export)\s.+$/;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) continue;

    const tags = [];
    if (!benignNumericLine.test(line) && hardcodedRegex.test(line)) {
      tags.push('HARD_CODED_NUMBER');
    }
    if (mathRegex.test(line)) {
      tags.push('MATH_LOGIC');
    }
    if (tags.length === 0) continue;
    flags.push({
      line: i + 1,
      tags,
      text: line,
    });
  }

  return flags;
}

function sectionHeader(title) {
  return [
    '',
    '================================================================================',
    title,
    '================================================================================',
    '',
  ].join('\n');
}

async function writeBundle({
  title,
  outPath,
  relFiles,
  flowNarrative = null,
}) {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const stream = createWriteStream(outPath, { encoding: 'utf8' });

  const write = (text) =>
    new Promise((resolve, reject) => {
      stream.write(text, (err) => (err ? reject(err) : resolve()));
    });

  await write(`# ${title}\n`);
  await write(
    `# Generated At: ${new Date().toISOString()}\n# Repo Root: ${toPosix(repoRoot)}\n# File Count: ${relFiles.length}\n`,
  );
  await write(
    '# NOTE: HARD_CODED_NUMBER / MATH_LOGIC labels are heuristic and intentionally broad for audit visibility.\n',
  );

  if (flowNarrative) {
    await write(sectionHeader('FLOW COMMENTARY: ONE DINAR JOURNEY (V25)'));
    await write(`${flowNarrative.trim()}\n`);
  }

  for (const rel of relFiles) {
    const abs = path.join(repoRoot, rel);
    const content = await readTextSafe(abs);
    if (content == null) continue;

    await write(sectionHeader(`FILE: ${rel}`));
    await write(`${content}\n`);

    const flags = hardcodedAndMathFlags(content);
    await write('\n-- HARD_CODED / MATH FLAGS --\n');
    if (flags.length === 0) {
      await write('No heuristic flags detected.\n');
    } else {
      for (const flag of flags) {
        await write(
          `[${flag.tags.join('|')}] L${flag.line}: ${flag.text}\n`,
        );
      }
    }
    await write('\n');
  }

  await new Promise((resolve, reject) => {
    stream.end((err) => (err ? reject(err) : resolve()));
  });
}

async function filesByContentPredicate(files, predicate) {
  const out = [];
  for (const abs of files) {
    if (!isTextFile(abs)) continue;
    const content = await readTextSafe(abs);
    if (content == null) continue;
    if (predicate(content, abs)) {
      out.push(toRel(abs));
    }
  }
  return out;
}

async function main() {
  const allAbs = await walkAllFiles(repoRoot);
  const allRel = allAbs.map(toRel);

  const accountingCoreRel = uniqueSorted(
    allRel.filter(
      (rel) =>
        isTextFile(path.join(repoRoot, rel)) &&
        (rel.startsWith('src/finance/') || rel.startsWith('src/accounting/')),
    ),
  );

  const dbFinancialBase = allRel.filter(
    (rel) =>
      rel === 'prisma/schema.prisma' ||
      rel.startsWith('prisma/migrations/'),
  );
  const triggerLike = await filesByContentPredicate(allAbs, (content, abs) => {
    const rel = toRel(abs);
    if (!isTextFile(abs)) return false;
    if (
      !(
        rel.startsWith('prisma/') ||
        rel.includes('/migration') ||
        rel.endsWith('.sql')
      )
    ) {
      return false;
    }
    return /create\s+trigger|trigger\s+|create\s+function|before\s+insert|after\s+update/i.test(
      content,
    );
  });
  const dbFinancialRel = uniqueSorted([...dbFinancialBase, ...triggerLike]);

  const transactionFlowRel = uniqueSorted(
    (
      await filesByContentPredicate(allAbs, (content, abs) => {
        const rel = toRel(abs);
        if (!rel.startsWith('src/')) return false;
        if (!/\.(service|controller)\.ts$/i.test(rel)) return false;
        return /payment[_-\s]?link|ensurepaymentlink|subscription|invoice|refund|checkout|wallet settlement|gateway|upayments/i.test(
          content,
        );
      })
    ).concat(
      allRel.filter(
        (rel) =>
          rel.startsWith('src/common/services/payments.service') ||
          rel.startsWith('src/customer-notifications/'),
      ),
    ),
  );

  const auditSecurityRel = uniqueSorted([
    ...allRel.filter(
      (rel) =>
        isTextFile(path.join(repoRoot, rel)) &&
        (rel.startsWith('src/audit-logs/') ||
          rel.startsWith('src/auth/') ||
          rel.startsWith('src/common/guards/')),
    ),
    ...(
      await filesByContentPredicate(allAbs, (content, abs) => {
        const rel = toRel(abs);
        if (!rel.startsWith('src/')) return false;
        return /audit|logfinancialevent|customer_collection_updated|permission|guard|security|logger|forbiddenexception|unauthorized/i.test(
          content,
        );
      })
    ),
  ]);

  const reportingMathRel = uniqueSorted(
    allRel.filter((rel) => {
      if (!isTextFile(path.join(repoRoot, rel))) return false;
      if (!rel.startsWith('src/')) return false;
      return /(report|summary|dashboard|statement|ledger|sales|income|balance|financial|cash|analytics)/i.test(
        rel,
      );
    }),
  );

  const frontendFinancialRel = uniqueSorted(
    allRel.filter((rel) => {
      if (!rel.startsWith('web/src/')) return false;
      if (!isTextFile(path.join(repoRoot, rel))) return false;
      if (!/\.(ts|tsx)$/.test(rel)) return false;
      return /(invoice|collection|ledger|financial|finance|cash|payment|debt|subscription|sales|report|kwd|pos)/i.test(
        rel,
      );
    }),
  );

  const flowNarrative = `
1) Order creation starts in \`src/orders/orders.service.ts\` via \`createQuick\` / \`posCheckout\` / \`createAsManager\`.
2) If payment is link-based, link orchestration is handled by \`src/common/services/payments.service.ts\` (\`createPaymentLink\`, \`ensurePaymentLinkForUnpaidOrder\`).
3) Link dispatch to customer is sent through \`src/customer-notifications/customer-notifications.service.ts\` (invoice-issued and collections link channels).
4) On payment callback/recheck, gateway verification finalizes settlement and updates order state, then debt visibility pipelines refresh.
5) Ledger-side settlement and debt impact pass through customer/finance services (\`customer-ledger\`, \`finance/debt*\`, outstanding and visibility facades).
6) Accounting/finance projections aggregate the remaining exposure (red KPI, outstanding rows, collections reports).
7) Frontend reads canonical values from API and renders them in collections/invoice/ledger/report pages without local financial authority.
`;

  await fs.mkdir(outDir, { recursive: true });

  await writeBundle({
    title: 'ACCOUNTING_ENGINE_CORE',
    outPath: path.join(outDir, 'ACCOUNTING_ENGINE_CORE.txt'),
    relFiles: accountingCoreRel,
    flowNarrative,
  });

  await writeBundle({
    title: 'DATABASE_FINANCIAL_INTEGRITY',
    outPath: path.join(outDir, 'DATABASE_FINANCIAL_INTEGRITY.txt'),
    relFiles: dbFinancialRel,
  });

  await writeBundle({
    title: 'TRANSACTION_FLOW_LOGIC',
    outPath: path.join(outDir, 'TRANSACTION_FLOW_LOGIC.txt'),
    relFiles: transactionFlowRel,
    flowNarrative,
  });

  await writeBundle({
    title: 'AUDIT_AND_SECURITY_LOGS',
    outPath: path.join(outDir, 'AUDIT_AND_SECURITY_LOGS.txt'),
    relFiles: auditSecurityRel,
  });

  await writeBundle({
    title: 'REPORTING_AND_MATH',
    outPath: path.join(outDir, 'REPORTING_AND_MATH.txt'),
    relFiles: reportingMathRel,
  });

  await writeBundle({
    title: 'FRONTEND_FINANCIAL_INPUTS',
    outPath: path.join(outDir, 'FRONTEND_FINANCIAL_INPUTS.txt'),
    relFiles: frontendFinancialRel,
  });

  const manifest = {
    generatedAt: new Date().toISOString(),
    repoRoot: toPosix(repoRoot),
    outputDir: toPosix(outDir),
    counts: {
      accountingCore: accountingCoreRel.length,
      dbFinancial: dbFinancialRel.length,
      transactionFlow: transactionFlowRel.length,
      auditSecurity: auditSecurityRel.length,
      reportingMath: reportingMathRel.length,
      frontendFinancial: frontendFinancialRel.length,
    },
  };

  await fs.writeFile(
    path.join(outDir, '_EXPORT_MANIFEST.json'),
    JSON.stringify(manifest, null, 2),
    'utf8',
  );

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});

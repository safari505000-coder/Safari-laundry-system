/**
 * Transfers to the company / settlement account (and similar) must not be
 * mixed into KNET row matching — these are not invoice-sized sale lines.
 * Configurable: extend `COMPANY_SETTLEMENT_ACCOUNT_MARKERS` if the bank
 * changes the printed IBAN/account text.
 */
const COMPANY_SETTLEMENT_ACCOUNT_MARKERS = ['6621633100414011'] as const;

const EAST = '٠١٢٣٤٥٦٧٨٩';
const PERS = '۰۱۲۳۴۵۶۷۸۹';
const LAT = '0123456789';

function normalizeEasternDigits(s: string): string {
  let out = '';
  for (const ch of s) {
    const i = EAST.indexOf(ch);
    if (i >= 0) {
      out += LAT[i]!;
      continue;
    }
    const j = PERS.indexOf(ch);
    if (j >= 0) {
      out += LAT[j]!;
      continue;
    }
    out += ch;
  }
  return out;
}

/** Masks company settlement account so one big PDF line is not 100% excluded. */
function redactCompanyAccountMarkers(s: string): string {
  let t = s;
  for (const m of COMPANY_SETTLEMENT_ACCOUNT_MARKERS) {
    t = t.split(m).join(' ');
  }
  return t;
}

const TRANSFER_TO_ACCOUNT_LINE =
  /(التحويل|تحويل|حوال[ةه]|transfer|transfert|settlement|تسوية|to\s*account|إلى\s*الحساب|beneficiar|مستفيد|شركة|company|إيداع|deposit\s*to|credit\s*to|تحويل\s*إلى)/i;

const BALANCE_OR_TOTAL_BAN_LINE =
  /(^|[^\d.])(balance|الرصيد|إجمالي\s*الرصيد|الإجمالي\s*balance|total\s*balance|running|closing|opening|رصيد\s*الحساب|الرصيد\s*الحالي|رصيد\s*ختام|رصيد\s*افتتاح|account\s*balance|المبلغ\s*الإجمالي\s*Balance|Balance\s*المبلغ|grand\s*total.*balance|balance.*grand)/i;

/**
 * True if this line should be ignored for KNET sales reconciliation
 * (transfer to the company account, running / closing "Balance" rows, etc.).
 */
export function isStatementLineExcludedFromKnetMatch(line: string): boolean {
  const n = line.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF\u2060\uFFF0-\uFFFD]/g, '');

  for (const marker of COMPANY_SETTLEMENT_ACCOUNT_MARKERS) {
    if (n.includes(marker)) {
      return true;
    }
  }
  if (BALANCE_OR_TOTAL_BAN_LINE.test(n) && !/(commission|عمولة|mdr|fee|رسوم)/i.test(n)) {
    return true;
  }
  if (TRANSFER_TO_ACCOUNT_LINE.test(n) && /\b[0-9]{10,18}\b/.test(n.replace(/[\s-]/g, ''))) {
    if (!/(knet|pos|sale|مبيع|invoice|فات|terminal|ter\s*id)/i.test(n)) {
      return true;
    }
  }
  return false;
}

/** Kuwait-style amounts; comma may be thousands separator. */
const AMOUNT_TOKEN =
  /\b\d{1,3}(?:,\d{3})*(?:\.\d{1,4})?\b|\b\d+\.\d{1,4}\b/g;

function pushParsedAmounts(line: string, into: number[]): void {
  for (const m of line.matchAll(AMOUNT_TOKEN)) {
    const raw = m[0]!.replace(/,/g, '');
    const v = Number.parseFloat(raw);
    if (Number.isFinite(v) && v > 0 && v < 50000) {
      into.push(v);
    }
  }
}

function uniqueSorted(nums: number[]): number[] {
  const seen = new Set<string>();
  const out: number[] = [];
  for (const n of nums) {
    const k = n.toFixed(4);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(n);
  }
  return out.sort((a, b) => a - b);
}

/**
 * Line-by-line + segment split (e.g. `;`), then a loose pass if nothing found
 * (common when the PDF is one long line, or the account / balance tokens killed all rows).
 */
export function extractBankAmounts(csvText: string): number[] {
  const raw = normalizeEasternDigits(redactCompanyAccountMarkers(csvText));
  const out: number[] = [];

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (isStatementLineExcludedFromKnetMatch(line)) {
      for (const seg of line.split(/[;|]/)) {
        const t = seg.trim();
        if (!t || isStatementLineExcludedFromKnetMatch(t)) continue;
        pushParsedAmounts(t, out);
      }
      continue;
    }
    pushParsedAmounts(line, out);
  }

  if (out.length > 0) {
    return uniqueSorted(out);
  }

  for (const m of raw.matchAll(AMOUNT_TOKEN)) {
    const v = Number.parseFloat(m[0]!.replace(/,/g, ''));
    if (Number.isFinite(v) && v > 0.001 && v < 50000) {
      out.push(v);
    }
  }
  if (out.length > 0) {
    return uniqueSorted(out);
  }
  for (const m of raw.matchAll(/\b\d+\.\d{1,4}\b/g)) {
    const v = Number.parseFloat(m[0]!);
    if (Number.isFinite(v) && v > 0 && v < 50000) {
      out.push(v);
    }
  }
  return uniqueSorted(out);
}

export type StatementSummaryHints = {
  /** Heuristic: commission / MDR / fee lines on the bank PDF */
  commission?: number;
  /** If the PDF has an explicit total gross / sales line */
  totalGross?: number;
  /** If the PDF has a net settlement / credit line */
  net?: number;
}

const COMMISSION_LINE =
  /(commission|عمولة|mdr|merchant\s*discount|service\s*charge|acquirer|fee(s)?\s*[:]|رسوم|عمول|bank\s*charge)/i;

const TOTAL_SALES =
  /(total\s*gross|gross\s*sales|total\s*amount|total\s*transactions|sum\s*of|aggregat|إجمالي|المجموع|مبيعات|المبلغ الإجمالي)/i;

const NET_LINE =
  /(net\s*settlement|amount\s*due|settlement|صافي|الصافي|المستحق|clearing|net\s*amount|credit(?!.*balance))/i;

function parseAmountsInLine(line: string): number[] {
  const out: number[] = [];
  const re = /(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,4}))?/g;
  for (const m of line.matchAll(re)) {
    const raw = m[0].replace(/,/g, '');
    const v = Number.parseFloat(raw);
    if (Number.isFinite(v) && v > 0) out.push(v);
  }
  return out;
}

/**
 * Best-effort parsing of UPayments / bank "statement of account" PDFs: finds
 * lines that look like commission, totals, and net, and picks plausible amounts.
 * Always verify against the source PDF; use overrides in the UI if needed.
 */
export function parseStatementSummaryHints(
  text: string,
): StatementSummaryHints {
  const ntext = normalizeEasternDigits(redactCompanyAccountMarkers(text));
  const lines = ntext.split(/\r?\n/);
  let commission: number | undefined;
  let totalGross: number | undefined;
  let net: number | undefined;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (isStatementLineExcludedFromKnetMatch(line)) continue;

    const amounts = parseAmountsInLine(line);
    if (amounts.length === 0) continue;
    // Prefer the last number on a label line (often the KD column)
    const pick = amounts[amounts.length - 1];

    if (COMMISSION_LINE.test(line) && pick < 5000) {
      commission = pick;
    }
    if (TOTAL_SALES.test(line) && !totalGross) {
      totalGross = pick;
    }
    if (NET_LINE.test(line) && pick > 1) {
      net = pick;
    }
  }

  return {
    commission,
    totalGross,
    net,
  };
}

/** Heuristic: PDF is likely image-based or unreadable. */
export function isLikelyUnextractableScannedStatement(text: string): boolean {
  const t = text.replace(/\s/g, '');
  return t.length < 40;
}

let workerSet = false;

/**
 * Loads `pdfjs-dist` on demand (first PDF upload) so the main bundle stays smaller.
 */
export async function extractTextFromStatementPdf(
  data: ArrayBuffer,
): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const { getDocument, GlobalWorkerOptions } = pdfjs;
  if (!workerSet) {
    const w = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    GlobalWorkerOptions.workerSrc = w.default;
    workerSet = true;
  }
  const loadingTask = getDocument({ data, useSystemFonts: true });
  const pdf = await loadingTask.promise;
  const parts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let line = '';
    for (const it of content.items) {
      const ti = it as { str?: string; hasEOL?: boolean };
      if (typeof ti.str === 'string') line += ti.str;
      if (ti.hasEOL) line += '\n';
      else line += ' ';
    }
    if (i < pdf.numPages) {
      line += '\n';
    }
    parts.push(line);
  }
  return parts.join('\n');
}

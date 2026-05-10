import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * V24 — Wave D2 (Implicit Governance) — Canonical DTO Purity Lock-in.
 *
 * The V24 commandment "Server-Side Truth" demands that every
 * money-shaped field on the wire is a canonical 4dp KWD STRING,
 * never a JS number. JS numbers are double-precision floats and
 * leak rounding errors as soon as the FE touches them.
 *
 * After Wave A (Authority Pull) migrated the last two outlier
 * DTOs, the entire `src/**\/*.dto.ts` and `src/**\/*.types.ts`
 * surface was certified clean: zero `*Kd: number` declarations.
 * This spec freezes that state — any future PR that re-introduces
 * a `*Kd: number` declaration FAILS the build, no exceptions.
 *
 * Allowed shapes:
 *   - `*Kd!: string`   — canonical 4dp KWD string (production)
 *   - `*Kd?: string`   — optional canonical KWD string
 *   - `*Kd: Decimal`   — Prisma.Decimal (internal; never wire)
 *   - `*Kd: Prisma.Decimal` — fully-qualified Decimal
 *
 * Forbidden:
 *   - `*Kd: number`
 *   - `*Kd!: number`
 *   - `*Kd?: number`
 *
 * If you genuinely need a `*Kd: number` field (extremely rare),
 * append the file to `ALLOW_LIST` below WITH a code-comment
 * rationale on the field. There is no "quiet" allowlist — every
 * entry needs a justification reviewable in PR.
 */

const SRC_ROOT = path.resolve(__dirname, '..');

/**
 * Files that are allowed to declare `*Kd: number` and the reason
 * each is sanctioned. Keep this list minimal — every entry is a
 * Frozen Core Policy crack that must be re-justified at every
 * release review.
 */
const ALLOW_LIST: ReadonlyArray<{ file: string; rationale: string }> = [
  // (intentionally empty — V24 Station 1 ships zero allowlist exemptions.
  //  If you add one, document the exact field, the reason it cannot be
  //  a string, and the date of architectural review.)
];

/** Recursively collects DTO + types files from a directory. */
function collectDtoFiles(dir: string): string[] {
  const out: string[] = [];
  const stack: string[] = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (
          entry.name === 'node_modules' ||
          entry.name === 'dist' ||
          entry.name.startsWith('.')
        ) {
          continue;
        }
        stack.push(full);
        continue;
      }
      if (
        entry.isFile() &&
        (entry.name.endsWith('.dto.ts') || entry.name.endsWith('.types.ts'))
      ) {
        out.push(full);
      }
    }
  }
  return out.sort();
}

/**
 * Strips line and block comments so commented-out examples or
 * documentation snippets like `// foo: number` don't false-alarm
 * the regex. Preserves line numbers for accurate diagnostics.
 */
function stripComments(src: string): string {
  // Remove block comments first (/* ... */), preserving newlines.
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, (m) =>
    m
      .split('')
      .map((c) => (c === '\n' ? '\n' : ' '))
      .join(''),
  );
  // Remove line comments (// ...) up to end of line.
  return noBlock.replace(/\/\/[^\n]*/g, '');
}

const FORBIDDEN_PATTERN = /\b(\w+Kd)[!?]?:\s*number\b/g;

describe('V24 Canonical DTO Purity (Wave D2 — Implicit Governance lock)', () => {
  it('every src/**/*.dto.ts and src/**/*.types.ts ships zero `*Kd: number` declarations', () => {
    const files = collectDtoFiles(SRC_ROOT);
    expect(files.length).toBeGreaterThan(0); // sanity — repo has DTOs

    const allowSet = new Set(
      ALLOW_LIST.map((entry) =>
        path.resolve(SRC_ROOT, entry.file).toLowerCase(),
      ),
    );

    type Violation = {
      file: string;
      line: number;
      field: string;
      excerpt: string;
    };
    const violations: Violation[] = [];

    for (const file of files) {
      if (allowSet.has(file.toLowerCase())) continue;
      const raw = fs.readFileSync(file, 'utf8');
      const stripped = stripComments(raw);
      let match: RegExpExecArray | null;
      FORBIDDEN_PATTERN.lastIndex = 0;
      while ((match = FORBIDDEN_PATTERN.exec(stripped)) !== null) {
        const before = stripped.slice(0, match.index);
        const line = before.split('\n').length;
        const lineStart = before.lastIndexOf('\n') + 1;
        const lineEnd = stripped.indexOf('\n', match.index);
        const excerpt = stripped
          .slice(lineStart, lineEnd === -1 ? undefined : lineEnd)
          .trim();
        violations.push({
          file: path
            .relative(SRC_ROOT, file)
            .replace(/\\/g, '/'),
          line,
          field: match[1],
          excerpt,
        });
      }
    }

    if (violations.length > 0) {
      const formatted = violations
        .map(
          (v) =>
            `  • src/${v.file}:${v.line} — field "${v.field}" must be a canonical 4dp KWD STRING (got "number"). Excerpt: ${v.excerpt}`,
        )
        .join('\n');
      throw new Error(
        `V24 Wave D2 — Canonical DTO Purity lock failed.\n\n` +
          `${violations.length} field(s) declare \`*Kd: number\` on the wire.\n` +
          `V24 Commandment #1 (Server-Side Truth) requires every money field to be a 4dp KWD string.\n\n` +
          `Violations:\n${formatted}\n\n` +
          `Fix: change the type to \`string\` and update the producer to emit \`new Prisma.Decimal(value).toFixed(4)\`. ` +
          `If a true exemption is required, append the file to ALLOW_LIST in this spec WITH a justification.`,
      );
    }

    expect(violations).toEqual([]);
  });

  it('ALLOW_LIST entries every reference an existing file (no stale exemptions)', () => {
    for (const entry of ALLOW_LIST) {
      const full = path.resolve(SRC_ROOT, entry.file);
      expect(fs.existsSync(full)).toBe(true);
      expect(entry.rationale.trim().length).toBeGreaterThan(0);
    }
  });
});

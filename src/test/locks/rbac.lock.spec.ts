import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const repoRoot = join(__dirname, '..', '..', '..');
const srcRoot = join(repoRoot, 'src');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (['node_modules', 'dist', '.git'].includes(entry)) continue;
      out.push(...walk(full));
    } else if (
      entry.endsWith('.controller.ts') &&
      !entry.endsWith('.spec.ts') &&
      !entry.endsWith('.test.ts')
    ) {
      out.push(full);
    }
  }
  return out.sort();
}

function normalizeRoleExpression(expr: string): string[] {
  const roles = Array.from(expr.matchAll(/SafariRole\.([A-Z_]+)/g)).map(
    (m) => m[1],
  );
  const spreads = Array.from(expr.matchAll(/\.\.\.([A-Z_][A-Z0-9_]*)/g)).map(
    (m) => `...${m[1]}`,
  );
  return [...roles, ...spreads].sort();
}

function findDecoratorArgBefore(
  text: string,
  index: number,
  decorator: string,
): string | null {
  const before = text.slice(0, index);
  const at = before.lastIndexOf(`@${decorator}(`);
  if (at === -1) return null;
  const between = before.slice(at);
  const nextRoute = Math.max(
    between.lastIndexOf('@Get('),
    between.lastIndexOf('@Post('),
    between.lastIndexOf('@Put('),
    between.lastIndexOf('@Patch('),
    between.lastIndexOf('@Delete('),
    between.lastIndexOf('@Controller('),
  );
  if (nextRoute > 0) return null;
  const start = at + decorator.length + 2;
  let depth = 1;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (depth === 0) return text.slice(start, i).replace(/\s+/g, ' ').trim();
  }
  return null;
}

function extractControllerPrefix(text: string): string {
  const m = text.match(/@Controller\(([^)]*)\)/s);
  if (!m) return '';
  const raw = m[1].trim();
  const quoted = raw.match(/['"`]([^'"`]*)['"`]/);
  return quoted?.[1] ?? raw.replace(/\s+/g, ' ');
}

function extractClassRoles(text: string): string[] {
  const controllerIdx = text.search(/@Controller\(/);
  if (controllerIdx === -1) return [];
  const arg = findDecoratorArgBefore(text, controllerIdx, 'Roles');
  return arg ? normalizeRoleExpression(arg) : [];
}

function routePath(prefix: string, subPath: string): string {
  const clean = [prefix, subPath]
    .filter(Boolean)
    .join('/')
    .replace(/\/+/g, '/')
    .replace(/^\//, '')
    .replace(/\/$/, '');
  return `/${clean}`;
}

describe('RBAC lock', () => {
  it('freezes every endpoint @Roles decorator', () => {
    const rows = [];
    const routeRe =
      /@(Get|Post|Put|Patch|Delete)\(([^)]*)\)\s*(?:\n\s*@[^\n]+)*\s*(?:async\s+)?([A-Za-z0-9_]+)\s*\(/gs;
    for (const file of walk(srcRoot)) {
      const text = readFileSync(file, 'utf8');
      const rel = relative(repoRoot, file).replace(/\\/g, '/');
      const prefix = extractControllerPrefix(text);
      const classRoles = extractClassRoles(text);
      for (const m of text.matchAll(routeRe)) {
        const method = m[1].toUpperCase();
        const rawPath = m[2];
        const quoted = rawPath.match(/['"`]([^'"`]*)['"`]/);
        const subPath = quoted?.[1] ?? '';
        const rolesArg = findDecoratorArgBefore(text, m.index ?? 0, 'Roles');
        rows.push({
          method,
          path: routePath(prefix, subPath),
          handler: m[3],
          file: rel,
          roles: rolesArg ? normalizeRoleExpression(rolesArg) : classRoles,
          roleSource: rolesArg
            ? 'method'
            : classRoles.length
              ? 'class'
              : 'none',
        });
      }
    }
    expect(
      rows.sort((a, b) =>
        `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`),
      ),
    ).toMatchSnapshot();
  });
});

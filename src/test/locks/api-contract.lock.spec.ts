import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const repoRoot = join(__dirname, '..', '..', '..');
const srcRoot = join(repoRoot, 'src');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.controller.ts')) out.push(full);
  }
  return out.sort();
}

function extractControllerPrefix(text: string): string {
  const m = text.match(/@Controller\(([^)]*)\)/s);
  if (!m) return '';
  const quoted = m[1].match(/['"`]([^'"`]*)['"`]/);
  return quoted?.[1] ?? m[1].trim().replace(/\s+/g, ' ');
}

function routePath(prefix: string, subPath: string): string {
  return `/${[prefix, subPath].filter(Boolean).join('/').replace(/\/+/g, '/').replace(/^\//, '').replace(/\/$/, '')}`;
}

type ApiEndpointLockEntry = {
  method: string;
  path: string;
  handler: string;
  file: string;
};

describe('API contract lock', () => {
  it('freezes public route methods and paths', () => {
    const endpoints: ApiEndpointLockEntry[] = [];
    const routeRe =
      /@(Get|Post|Put|Patch|Delete)\(([^)]*)\)\s*(?:\n\s*@[^\n]+)*\s*(?:async\s+)?([A-Za-z0-9_]+)\s*\(/gs;
    for (const file of walk(srcRoot)) {
      const text = readFileSync(file, 'utf8');
      const rel = relative(repoRoot, file).replace(/\\/g, '/');
      const prefix = extractControllerPrefix(text);
      for (const m of text.matchAll(routeRe)) {
        const quoted = m[2].match(/['"`]([^'"`]*)['"`]/);
        endpoints.push({
          method: m[1].toUpperCase(),
          path: routePath(prefix, quoted?.[1] ?? ''),
          handler: m[3],
          file: rel,
        });
      }
    }
    expect(
      endpoints.sort((a, b) =>
        `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`),
      ),
    ).toMatchSnapshot();
  });
});

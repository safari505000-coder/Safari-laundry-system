import { INestApplication, Logger } from '@nestjs/common';

/**
 * Set `DEBUG_NEST_ROUTES=1` when starting the API to log Express layers whose
 * path hints at `customers` + `360`. Helps verify `GET /api/customers/:id/360`
 * is actually mounted (global `/api` prefix may not appear in `route.path`).
 */
export function logDebugCustomer360Routes(app: INestApplication): void {
  if (process.env.DEBUG_NEST_ROUTES !== '1') {
    return;
  }
  const log = new Logger('DEBUG_NEST_ROUTES');
  try {
    const instance = app.getHttpAdapter().getInstance() as {
      _router?: {
        stack?: Array<{
          route?: { path: string; methods: Record<string, unknown> };
        }>;
      };
    };
    const stack = instance._router?.stack ?? [];
    const lines: string[] = [];
    for (const layer of stack) {
      const route = layer.route;
      if (!route?.path) continue;
      const pathStr = String(route.path);
      const methods = Object.entries(route.methods ?? {})
        .filter(([k, v]) => v === true && k !== 'all')
        .map(([k]) => k.toUpperCase())
        .sort();
      if (!methods.length) continue;
      const row = `${methods.join('|')} ${pathStr}`;
      if (pathStr.includes('360') || (pathStr.includes('customer') && methods.includes('GET'))) {
        lines.push(row);
      }
    }
    const focused = lines.filter((l) => l.includes('360'));
    log.log(
      focused.length ?
        `Layers mentioning "360":\n${focused.join('\n')}`
      : lines.length ?
        `No "360" path in stack; GET+customer samples:\n${lines.slice(0, 25).join('\n')}`
      : `Express router stack has ${stack.length} layers (no route.path entries — Express 5+ or different adapter).`,
    );
  } catch (e) {
    log.warn(`Route introspection failed: ${String(e)}`);
  }
}

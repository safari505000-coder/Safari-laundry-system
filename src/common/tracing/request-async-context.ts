import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

export type RequestContextStore = {
  traceId?: string;
  orderId?: string;
};

export const requestContext = new AsyncLocalStorage<RequestContextStore>();

export function requestContextMiddleware(
  req: Request & { traceId?: string; requestId?: string },
  _res: Response,
  next: NextFunction,
): void {
  const traceId = req.traceId ?? req.requestId;
  const orderId = pickOrderIdFromRequest(req);
  requestContext.run({ traceId, orderId }, () => next());
}

function paramOrderId(v: unknown): string | undefined {
  if (typeof v === 'string' && v.length >= 8) {
    return v;
  }
  if (Array.isArray(v) && typeof v[0] === 'string' && v[0].length >= 8) {
    return v[0];
  }
  return undefined;
}

function pickOrderIdFromRequest(req: {
  params?: Record<string, string | string[] | undefined>;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
  path?: string;
}): string | undefined {
  const p = paramOrderId(req.params?.orderId) ?? paramOrderId(req.params?.referenceId);
  if (p) {
    return p;
  }
  const b = req.body;
  if (b && typeof b === 'object') {
    for (const k of ['orderId', 'referenceId', 'requested_order_id']) {
      const v = b[k];
      if (typeof v === 'string' && v.length >= 8) {
        return v;
      }
    }
  }
  const q = req.query?.orderId;
  if (typeof q === 'string' && q.length >= 8) {
    return q;
  }
  const path = req.path ?? '';
  const m = path.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
  );
  return m?.[0];
}

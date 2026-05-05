import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { currentTraceId } from '../tracing/trace-context';

export type RequestWithId = Request & { requestId?: string };
export type RequestWithTrace = RequestWithId & { traceId?: string };

/**
 * Ensures every API response echoes `X-Request-ID` (from client or generated)
 * and attaches `requestId` on the request for structured logging.
 */
export function requestIdMiddleware(
  req: RequestWithTrace,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.headers['x-request-id'];
  const id =
    typeof incoming === 'string' && incoming.trim().length > 0 ?
      incoming.trim()
    : randomUUID();
  req.requestId = id;
  req.traceId = currentTraceId() ?? id;
  res.setHeader('X-Request-ID', id);
  res.setHeader('X-Trace-ID', req.traceId);
  next();
}

import type { NextFunction, Request, Response } from 'express';
import { hasBlockedClientIp } from '../security/ip-reputation.hook';

/**
 * Optional zero-trust hook: block IPs listed in env (CSV).
 * No network I/O; fails closed only when IP matches list.
 */
export function ipReputationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const reason = hasBlockedClientIp(req.ip, req.socket?.remoteAddress);
  if (reason) {
    res.status(403).json({ status: 'forbidden', code: 'ip_reputation', reason });
    return;
  }
  next();
}

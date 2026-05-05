import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { CustomerBlockingService } from '../services/customer-blocking.service';

type RequestWithUser = Request & {
  user?: { role?: string | null };
};

@Injectable()
export class CustomerBlockGuard implements CanActivate {
  constructor(private readonly blocking: CustomerBlockingService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const customer = await this.blocking.findCustomerForRequest(req);
    if (!customer?.isBlocked) {
      return true;
    }

    const role = req.user?.role;
    const canOverride = this.blocking.canOverrideBlockedCustomer(role);
    if (!canOverride || !this.blocking.hasOverrideHeader(req)) {
      throw new ForbiddenException({
        message: 'CUSTOMER_BLOCKED',
        errorCode: 'CUSTOMER_BLOCKED',
        blockReason: customer.blockReason ?? 'غير محدد',
      });
    }

    await this.blocking.logBlockedOverride(req, customer);
    return true;
  }
}

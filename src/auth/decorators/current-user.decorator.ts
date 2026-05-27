import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type JwtUser = {
  userId: string;
  role: string;
  branchId: string | null;
  scope?: 'ALL' | 'BRANCH' | 'OWN';
  /** B2C portal — must equal `Customer.id` when role is CUSTOMER. */
  linkedCustomerId?: string | null;
  tokenPurpose?: 'PASSWORD_CHANGE_ONLY' | 'CUSTOMER_PORTAL';
};

export const CurrentUser = createParamDecorator(
  (data: keyof JwtUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: JwtUser }>();
    const user = request.user;
    if (!user) {
      return undefined;
    }
    return data ? user[data] : user;
  },
);

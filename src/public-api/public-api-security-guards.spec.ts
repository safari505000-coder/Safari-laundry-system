import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..', '..');

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

describe('Public API security guards', () => {
  it('rate-limits customer portal lookup, OTP, and payment-link creation', () => {
    const controller = read('src/public-api/public-api.controller.ts');

    expect(controller).toContain("@Get('customer-portal')");
    expect(controller).toContain("@Post('customer-auth/request-otp')");
    expect(controller).toContain("@Post('customer-portal/payment-link')");
    expect(controller).toContain("@Post('customer-portal/pay-balance')");
    expect(controller).toContain('@Throttle');
    expect(controller).toContain('PUBLIC_PORTAL_LOOKUP_THROTTLE_PER_MIN');
    expect(controller).toContain('PUBLIC_OTP_THROTTLE_PER_MIN');
    expect(controller).toContain('PUBLIC_PAYMENT_THROTTLE_PER_MIN');
  });

  it('keeps staff-only call-center website routes behind JWT + RolesGuard', () => {
    const controller = read('src/public-api/public-api.controller.ts');

    expect(controller).toContain("@Get('call-center/website-payments')");
    expect(controller).toContain("@Get('call-center/website-order-requests')");
    expect(controller).toContain('@UseGuards(RolesGuard)');
    expect(controller).toContain('@NoOwnerBypass()');
    expect(controller).toContain('SafariRole.CALL_CENTER');
  });

  it('website balance payment links charge visible banking-core debt only', () => {
    const service = read('src/public-api/website-customer-payments.service.ts');

    expect(service).toContain('debtVisibility.getCustomerVisibleDebt');
    expect(service).toContain('computeOrderRemainingBalancesBatch');
    expect(service).toContain('customerOwnsPhone');
    expect(service).toContain('ForbiddenException');
    expect(service).toContain('paymentLinkChargeMatches');
  });

  it('public web does not calculate KWD totals locally for portal pay actions', () => {
    const main = read('apps/public-web/src/main.tsx');
    const api = read('apps/public-web/src/api.ts');

    expect(main).toContain('createCustomerBalancePaymentLink');
    expect(main).toContain('createCustomerPaymentLink');
    expect(main).not.toMatch(/remainingAmountKd\s*\+/);
    expect(main).not.toMatch(/debtKd\s*\+/);
    expect(api).toContain('/public/customer-portal/pay-balance');
    expect(api).toContain('/public/customer-portal/payment-link');
  });
});

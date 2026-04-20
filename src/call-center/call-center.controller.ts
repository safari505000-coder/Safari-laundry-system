import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { APP_BRAND } from '../common/constants/branding';
import { CallCenterService } from './call-center.service';
import { ActivateSubscriptionDto } from './dto/activate-subscription.dto';
import { ExtendSubscriptionDto } from './dto/extend-subscription.dto';
import { DebtRecoveryQueryDto } from './dto/debt-recovery-report.dto';
import { MarkOrderPaidDto } from './dto/mark-order-paid.dto';
import { RecordPartialDebtPaymentDto } from './dto/record-partial-debt-payment.dto';

@ApiTags('call-center')
@ApiBearerAuth('bearer')
@Controller('call-center')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(SafariRole.CALL_CENTER)
export class CallCenterController {
  constructor(private readonly callCenterService: CallCenterService) {}

  @Get('operations-summary')
  @Roles(
    SafariRole.CALL_CENTER,
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
  )
  @ApiOperation({
    summary: `Call center operations summary — 3 KPIs (${APP_BRAND})`,
    description:
      'V1.6.1 — RED total market debt (Σ unpaid non-canceled orders), GREEN debt collected today strictly between Kuwait-local 00:00 and now (Σ metadata.debtSettled), YELLOW count of open UNPAID orders with a hosted payment URL awaiting action. Pass `?branchId=<uuid>` to scope every aggregate to a single branch (driver.branchId OR customer.originBranchId when driver-less); omit for global totals.',
  })
  operationsSummary(@Query('branchId') branchId?: string) {
    // Empty / sentinel values ("__ALL__") → global.
    const raw = (branchId ?? '').trim();
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const scoped = raw && uuidRe.test(raw) ? raw : null;
    return this.callCenterService.getOperationsSummary(scoped);
  }

  @Get('debt-recovery-report')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOperation({
    summary: `Debt recovery over time — owner reporting (${APP_BRAND})`,
    description:
      'OWNER only. Daily breakdown of debt-settled KWD (from ORDER_WALLET_SETTLEMENT + SUBSCRIPTION_ACTIVATION metadata.debtSettled). Defaults to last 30 days.',
  })
  debtRecoveryReport(@Query() q: DebtRecoveryQueryDto) {
    return this.callCenterService.getDebtRecoveryReport(q.from, q.to);
  }

  @Get('subscription-plans')
  @ApiOperation({
    summary: `List active subscription plans (${APP_BRAND})`,
    description:
      'CALL_CENTER only. Read-only catalog for activation (pay X → credit Y).',
  })
  listPlans() {
    return this.callCenterService.listActiveSubscriptionPlans();
  }

  @Get('customers')
  @ApiOperation({
    summary: `Search customers (${APP_BRAND})`,
    description:
      'CALL_CENTER only. Matches phone or address (case-insensitive), max 50 results.',
  })
  searchCustomers(@Query('q') q: string) {
    return this.callCenterService.searchCustomers(q ?? '');
  }

  @Post('subscriptions/activate')
  @ApiOperation({
    summary: `Activate subscription for customer (${APP_BRAND})`,
    description:
      'CALL_CENTER only. Collected plan price is applied to customer debt first (automatic settlement), then the remainder of the plan credit increases prepaid balance. All wallet updates run inside this transaction — no bypass.',
  })
  activateSubscription(
    @Body() dto: ActivateSubscriptionDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.callCenterService.activateSubscription(user.userId, dto);
  }

  @Post('subscriptions/extend')
  @ApiOperation({
    summary: `Extend an active subscription by N days (${APP_BRAND})`,
    description:
      'Dastur V1.5.3 — Management Room "Extend Subscription". Pushes subscriptionExpiresAt forward by extensionDays (1..365) on the SAME plan. Does not touch wallet balance/debt. Audited via a SUBSCRIPTION_ACTIVATION row with amount=0 and metadata.extensionOnly=true.',
  })
  extendSubscription(
    @Body() dto: ExtendSubscriptionDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.callCenterService.extendSubscription(user.userId, dto);
  }

  @Post('orders/:orderId/reminder')
  @Roles(SafariRole.CALL_CENTER, SafariRole.OWNER)
  @ApiOperation({
    summary: `Mark a collection reminder as sent (${APP_BRAND})`,
    description:
      'Dastur §5 (V1.5). Atomic 24h-guarded reminder counter bump for an order. Returns `{sent:true}` when the counter was incremented, or `{sent:false, nextAllowedAtIso}` when the 24h cooldown is still active.',
  })
  markOrderReminderSent(
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.callCenterService.sendOrderReminder(orderId);
  }

  @Post('orders/:orderId/payment-link')
  @Roles(SafariRole.CALL_CENTER)
  @ApiOperation({
    summary: `Ensure a hosted payment link exists for an unpaid order (${APP_BRAND})`,
    description:
      'V1.6.0 — CALL_CENTER only. Returns the existing hosted-checkout URL if one was already minted, otherwise calls the gateway and persists a new link on the order. Works for ANY unpaid non-canceled order regardless of original payment method (Cash, KNET, DEBT_ON_ACCOUNT, PAYMENT_LINK, ONLINE). When the gateway callback later confirms payment, the order auto-switches to `posPaymentMethod=ONLINE` and the ledger row is tagged `debtSettlementViaLink=true` with `originalPaymentMethod` preserved for Accountant reports.',
  })
  ensureOrderPaymentLink(
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.callCenterService.ensureOrderPaymentLink(orderId);
  }

  @Post('orders/:orderId/mark-paid')
  @Roles(SafariRole.CALL_CENTER)
  @ApiOperation({
    summary: `Mark a collection order as manually paid (${APP_BRAND})`,
    description:
      'V1.6.9 — CALL_CENTER only. Confirms that the customer has paid an outstanding invoice and records the method actually used (CASH / KNET / PAYMENT_LINK / ONLINE). Flips the order to COMPLETED + PAID_TO_DRIVER, writes an ORDER_WALLET_SETTLEMENT ledger row tagged `debtSettlementViaCallCenter=true` with `originalPaymentMethod` preserved, and updates the customer wallet via the shared settlement logic. Idempotent: replaying on an already-settled order returns `{alreadySettled:true}` without side effects. Canceled orders are rejected.',
  })
  markCollectionOrderPaid(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: MarkOrderPaidDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.callCenterService.markCollectionOrderPaid(
      orderId,
      dto.paymentMethod,
      user.userId,
    );
  }

  @Post('subscribers/:customerId/reminder')
  @Roles(SafariRole.CALL_CENTER, SafariRole.OWNER)
  @ApiOperation({
    summary: `Mark a subscription renewal reminder as sent (${APP_BRAND})`,
    description:
      'Dastur §5 (V1.5). Atomic 24h-guarded reminder counter bump for a subscriber. Counter lives on CustomerWallet; wallet is created lazily on first reminder.',
  })
  markSubscriberReminderSent(
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return this.callCenterService.sendSubscriberReminder(customerId);
  }


  @Get('customers/:customerId/settlements')
  @ApiOperation({
    summary: `Customer settlement history (${APP_BRAND})`,
    description:
      'CALL_CENTER only. Recent subscription activations and order wallet settlements with debt/balance breakdown when recorded.',
  })
  listSettlements(
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return this.callCenterService.listCustomerSettlementHistory(customerId);
  }

  @Get('customers/:customerId/subscription-rollover-preview')
  @ApiOperation({
    summary: `Preview subscription rollover (${APP_BRAND})`,
    description:
      'V19.4 CC pack #2 — read-only snapshot of what the next subscription activation will carry forward. Returns `hasPrevious:false` for first-time activations. The UI uses this to power the "are you sure?" confirmation modal before POST /subscriptions/activate. No side effects.',
  })
  previewSubscriptionRollover(
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return this.callCenterService.previewSubscriptionRollover(customerId);
  }

  @Post('customers/:customerId/partial-debt-payment')
  @ApiOperation({
    summary: `Partial debt payment + optional discount (${APP_BRAND})`,
    description:
      'V19.4 CC pack #1. Collects a subset of the customer\'s outstanding debt, with an optional goodwill discount applied on top. The collected portion counts in the daily "Collected Today" KPI; the discount portion is written to the ledger as a separate GL entry (DEBT_DISCOUNTED) so it never inflates collection figures. Amount + discount together must not exceed the current wallet debt. Runs in a single transaction: wallet, TransactionHistory, and GL rows succeed or fail together.',
  })
  recordPartialDebtPayment(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() dto: RecordPartialDebtPaymentDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.callCenterService.recordPartialDebtPayment(
      customerId,
      dto,
      user.userId,
    );
  }

  @Get('customers/:customerId/subscriptions')
  @ApiOperation({
    summary: `Customer subscription chain (${APP_BRAND})`,
    description:
      'V19.4 CC pack #11 + #12 — full chain of subscriptions for a customer, most-recent first, with every invoice issued while each subscription window was ACTIVE. Powers the call-center subscriptions timeline.',
  })
  listCustomerSubscriptionChain(
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return this.callCenterService.listCustomerSubscriptionChain(customerId);
  }
}

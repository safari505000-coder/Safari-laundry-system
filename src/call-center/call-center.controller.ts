import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PosPaymentMethod, SafariRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { APP_BRAND } from '../common/constants/branding';
import { CallCenterService } from './call-center.service';
import {
  ActivateSubscriptionDto,
  SUBSCRIPTION_ACTIVATION_PAYMENT_METHODS,
} from './dto/activate-subscription.dto';
import { CancelSubscriptionDto } from './dto/cancel-subscription.dto';
import { ExtendSubscriptionDto } from './dto/extend-subscription.dto';
import { DebtRecoveryQueryDto } from './dto/debt-recovery-report.dto';
import { MarkOrderPaidDto } from './dto/mark-order-paid.dto';
import { RecordPartialDebtPaymentDto } from './dto/record-partial-debt-payment.dto';
import { CustomerLedgerQueryDto } from './dto/customer-ledger.dto';
import { DailyCollectionsQueryDto } from './dto/daily-collections.dto';
import { DailyCollectionsReconciliationQueryDto } from './dto/daily-collections-reconciliation.dto';
// CC pack #9 — the response shape is declared for the OpenAPI client but
// the DTO has no request body (pure GET path param), so we import only
// where needed in the return type of the service.

@ApiTags('call-center')
@ApiBearerAuth('bearer')
@Controller('call-center')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(SafariRole.CALL_CENTER, SafariRole.CALL_CENTER_SUPERVISOR)
export class CallCenterController {
  constructor(private readonly callCenterService: CallCenterService) {}

  @Get('operations-summary')
  @Roles(
    SafariRole.CALL_CENTER,
    SafariRole.CALL_CENTER_SUPERVISOR,
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.MANAGER,
    SafariRole.DRIVER,
  )
  @ApiOperation({
    summary: `Call center operations summary — 3 KPIs (${APP_BRAND})`,
    description:
      'V1.6.1 — RED total market debt (Σ unpaid non-canceled orders), GREEN debt collected today strictly between Kuwait-local 00:00 and now (Σ metadata.debtSettled), YELLOW count of open UNPAID orders with a hosted payment URL awaiting action. Pass `?branchId=<uuid>` to scope every aggregate to a single branch (driver.branchId OR customer.originBranchId when driver-less); omit for global totals.',
  })
  operationsSummary(
    @Query('branchId') branchId: string | undefined,
    @CurrentUser() user: JwtUser,
  ) {
    // Empty / sentinel values ("__ALL__") → global.
    const raw = (branchId ?? '').trim();
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const scoped = raw && uuidRe.test(raw) ? raw : null;
    return this.callCenterService.getOperationsSummary(scoped, user);
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
      'CALL_CENTER only. Plan credit is applied to customer debt first, then the remainder increases prepaid balance. When plan `salePrice` > 0, `paymentMethod` is mandatory: cash-like methods book `POS_SALE_COMPLETED` for the sale; `DEBT_ON_ACCOUNT` accrues the sale price onto `wallet.debt` and writes a matching GL receivable line. All wallet updates run inside this transaction — no bypass.',
  })
  activateSubscription(
    @Body() dto: ActivateSubscriptionDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.callCenterService.activateSubscription(user.userId, dto);
  }

  @Post('subscriptions/cancel')
  @ApiOperation({
    summary: `Cancel active subscription (refund math + promo void) (${APP_BRAND})`,
    description:
      'CALL_CENTER only — while validity remains. Applies time-based split between customer-paid snapshot (possible cash refund) vs company promotional gap (gift void, never refunded as cash). Writes SUBSCRIPTION_CANCELLATION ledger + GL DEBT_ADJUSTMENT traces.',
  })
  cancelActiveSubscription(
    @Body() dto: CancelSubscriptionDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.callCenterService.cancelActiveSubscription(user.userId, dto);
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
  @Roles(
    SafariRole.CALL_CENTER,
    SafariRole.CALL_CENTER_SUPERVISOR,
    SafariRole.OWNER,
    SafariRole.MANAGER,
    SafariRole.DRIVER,
  )
  @ApiOperation({
    summary: `Mark a collection reminder as sent (${APP_BRAND})`,
    description:
      'Dastur §5 (V1.5). Atomic 24h-guarded reminder counter bump for an order. Returns `{sent:true}` when the counter was incremented, or `{sent:false, nextAllowedAtIso}` when the 24h cooldown is still active.',
  })
  markOrderReminderSent(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.callCenterService.sendOrderReminder(orderId, user);
  }

  @Post('orders/:orderId/payment-link')
  @Roles(
    SafariRole.CALL_CENTER,
    SafariRole.CALL_CENTER_SUPERVISOR,
    SafariRole.MANAGER,
    SafariRole.DRIVER,
  )
  @ApiOperation({
    summary: `Ensure a hosted payment link exists for an unpaid order (${APP_BRAND})`,
    description:
      'V1.6.0 — CALL_CENTER only. Returns the existing hosted-checkout URL if one was already minted, otherwise calls the gateway and persists a new link on the order. Works for ANY unpaid non-canceled order regardless of original payment method (Cash, KNET, DEBT_ON_ACCOUNT, PAYMENT_LINK, ONLINE). When the gateway callback later confirms payment, the order auto-switches to `posPaymentMethod=ONLINE` and the ledger row is tagged `debtSettlementViaLink=true` with `originalPaymentMethod` preserved for Accountant reports.',
  })
  ensureOrderPaymentLink(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.callCenterService.ensureOrderPaymentLink(orderId, user);
  }

  @Post('orders/:orderId/send-payment-link-whatsapp')
  @Roles(
    SafariRole.CALL_CENTER,
    SafariRole.CALL_CENTER_SUPERVISOR,
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.MANAGER,
    SafariRole.DRIVER,
  )
  @ApiOperation({
    summary: `Push payment-link message to customer (Moatmt / webhook) (${APP_BRAND})`,
    description:
      'Ensures a hosted link, applies the same reminder/cooldown as the Collections page, then sends the Arabic template via MOATMT_* or CUSTOMER_NOTIFY_WEBHOOK_URL so the client receives WhatsApp without opening wa.me. Returns `serverPush: false` if no channel is configured or delivery failed — client should fall back to wa.me.',
  })
  sendPaymentLinkToCustomerWhatsapp(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.callCenterService.sendPaymentLinkToCustomerWhatsapp(
      orderId,
      user,
    );
  }

  @Post('orders/:orderId/mark-paid')
  @Roles(
    SafariRole.CALL_CENTER,
    SafariRole.CALL_CENTER_SUPERVISOR,
    SafariRole.MANAGER,
    SafariRole.DRIVER,
  )
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
      user,
    );
  }

  @Post('subscribers/:customerId/reminder')
  @Roles(SafariRole.CALL_CENTER, SafariRole.CALL_CENTER_SUPERVISOR, SafariRole.OWNER)
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

  @Get('customers/:customerId/ledger')
  @Roles(
    SafariRole.CALL_CENTER,
    SafariRole.CALL_CENTER_SUPERVISOR,
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.ACCOUNTANT,
  )
  @ApiOperation({
    summary: `Customer 360 ledger — invoices + timeline + cut-off markers (${APP_BRAND})`,
    description:
      'V19.4 CC pack #8 + #10 + #11. Unified read-only snapshot for a single customer: wallet header, active subscription (if any), full invoice list with payment method + cut-off flag, chronological ledger events with running balance. Accepts optional Kuwait-local YYYY-MM-DD `from`/`to` bounds and `limit`/`offset`. Wide RBAC so Owner/GM/Accountant can audit without impersonating a CC agent.',
  })
  getCustomerLedger(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query() q: CustomerLedgerQueryDto,
  ) {
    return this.callCenterService.getCustomerLedger(customerId, q);
  }

  @Post('customers/:customerId/statement-share-link')
  @Roles(
    SafariRole.CALL_CENTER,
    SafariRole.CALL_CENTER_SUPERVISOR,
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.ACCOUNTANT,
  )
  @ApiOperation({
    summary: `Mint a public share link for the customer statement (${APP_BRAND})`,
    description:
      'V19.8.9 — returns a signed, 7-day-lived URL that renders the customer\'s A4 statement in a login-less view. The agent pastes this URL into WhatsApp; wa.me cannot attach binary files, so we send a viewable page the customer can print/save as PDF from their phone instead. Optional `from`/`to` Kuwait-local dates scope the statement range embedded in the token.',
  })
  async createStatementShareLink(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query() q: CustomerLedgerQueryDto,
    @Req() req: Request,
  ) {
    const proto =
      (req.headers['x-forwarded-proto'] as string | undefined) ??
      req.protocol ??
      'http';
    const host = (req.headers['x-forwarded-host'] as string | undefined) ??
      req.headers.host ??
      'localhost:3000';
    // Prefer an explicit PUBLIC_WEB_APP_URL when configured (e.g. behind a
    // reverse proxy / CDN) so the link points at the customer-facing
    // origin; fall back to the request origin otherwise.
    const publicBaseUrl =
      process.env.PUBLIC_WEB_APP_URL?.replace(/\/$/, '') ||
      `${proto}://${host}`;
    return this.callCenterService.createStatementShareToken(customerId, {
      from: q.from ?? null,
      to: q.to ?? null,
      publicBaseUrl,
    });
  }

  @Get('daily-collections')
  @Roles(
    SafariRole.CALL_CENTER,
    SafariRole.CALL_CENTER_SUPERVISOR,
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.MANAGER,
  )
  @ApiOperation({
    summary: `Daily collector feed — today's debt reductions (${APP_BRAND})`,
    description:
      'V19.4 CC pack #4. Lists every debt-reducing ledger row written between Kuwait 00:00 and 24:00 (default today) with per-agent totals. Includes CC #1 partial debt payments, "mark paid via link" settlements, and any order settlement that reduced debt. Pass `?agentId=<uuid>` for a per-collector view; supervisors see everyone when omitted.',
  })
  getDailyCollections(@Query() q: DailyCollectionsQueryDto) {
    return this.callCenterService.getDailyCollections(q);
  }

  @Get('daily-collections/reconciliation')
  @Roles(
    SafariRole.CALL_CENTER,
    SafariRole.CALL_CENTER_SUPERVISOR,
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.MANAGER,
  )
  @ApiOperation({
    summary: `Daily collector reconciliation — TH ↔ GL validator (${APP_BRAND})`,
    description:
      "V19.5 — read-time validator that re-aggregates today's debt collections from both TransactionHistory (UI source) and GeneralLedgerEntry (accounting source) and reports the delta. At steady state the two MUST agree because every write runs through a single Prisma transaction that updates both. The daily 23:59 Kuwait cron calls this endpoint and logs a Sentry warning if `overallStatus=DRIFT`; the Collections page shows a ✓/⚠ badge alongside the KPI tiles.",
  })
  getDailyCollectionsReconciliation(
    @Query() q: DailyCollectionsReconciliationQueryDto,
  ) {
    return this.callCenterService.getDailyCollectionsReconciliation(q);
  }

  @Get('customers/:customerId/debt-conversion-options')
  @Roles(
    SafariRole.CALL_CENTER,
    SafariRole.CALL_CENTER_SUPERVISOR,
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.ACCOUNTANT,
  )
  @ApiOperation({
    summary: `Convert debt \u2192 subscription preview (${APP_BRAND})`,
    description:
      "V19.4 CC pack #9. Read-only preview. Optional `?paymentMethod=` (CASH, KNET, PAYMENT_LINK, ONLINE, DEBT_ON_ACCOUNT) mirrors how `activateSubscription` will book the plan sale — cash-like methods show cash required = sale price; on-account shows the sale accruing to remaining debt instead.",
  })
  getDebtConversionOptions(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query('paymentMethod') raw?: string,
  ) {
    const trimmed = raw?.trim().toUpperCase();
    let hint: PosPaymentMethod | undefined;
    if (trimmed) {
      const ok = SUBSCRIPTION_ACTIVATION_PAYMENT_METHODS.some((m) => m === trimmed);
      if (!ok) {
        throw new BadRequestException(
          `Invalid paymentMethod "${raw}" — expected one of: ${SUBSCRIPTION_ACTIVATION_PAYMENT_METHODS.join(', ')}`,
        );
      }
      hint = trimmed as PosPaymentMethod;
    }
    return this.callCenterService.getDebtConversionOptions(customerId, hint);
  }
}

import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SafariRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { JwtUser } from '../../auth/decorators/current-user.decorator';
import {
  AgingService,
} from './aging.service';
import type {
  AgingReport,
  CustomerAgingSummary,
  InvoiceAgingRow,
} from './aging.types';

/**
 * V20.5 — Phase 1 Aging endpoints.
 *
 *   GET /api/finance/aging/report
 *     Banking-grade portfolio report with totals per bucket and
 *     headline numbers (total receivable, critical receivable,
 *     customers count, invoices count).
 *
 *   GET /api/finance/aging/customers
 *     Per-customer summary used by collections workbench /
 *     dashboard cohort tiles.
 *
 *   GET /api/finance/aging/invoices?customerId=...
 *     Per-invoice rows. `customerId` filter is optional — the
 *     unfiltered call returns the whole portfolio (paginated by
 *     the caller, the service caps via Prisma.findMany batching).
 *
 * Restricted to Owner / Accountant / GM / CC Supervisor — the
 * roles that act on aging information. Drivers and standard call
 * center agents see only their assigned customers via
 * higher-level endpoints (Customer 360 / Collections workbench)
 * which call the service internally.
 */
const ALLOWED_ROLES = new Set<string>([
  SafariRole.OWNER,
  SafariRole.ACCOUNTANT,
  SafariRole.GENERAL_MANAGER,
  SafariRole.CALL_CENTER_SUPERVISOR,
]);

function parseAsOf(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;
  const v = new Date(raw);
  if (Number.isNaN(v.getTime())) return undefined;
  return v;
}

@Controller('api/finance/aging')
@UseGuards(JwtAuthGuard)
export class AgingController {
  constructor(private readonly aging: AgingService) {}

  @Get('report')
  async getReport(
    @CurrentUser() user: JwtUser,
    @Query('asOf') asOf?: string,
  ): Promise<AgingReport> {
    this.assertAllowed(user);
    return this.aging.getReport({ asOf: parseAsOf(asOf) });
  }

  @Get('customers')
  async listCustomers(
    @CurrentUser() user: JwtUser,
    @Query('asOf') asOf?: string,
  ): Promise<CustomerAgingSummary[]> {
    this.assertAllowed(user);
    return this.aging.listCustomerAging({ asOf: parseAsOf(asOf) });
  }

  @Get('invoices')
  async listInvoices(
    @CurrentUser() user: JwtUser,
    @Query('customerId') customerId?: string,
    @Query('asOf') asOf?: string,
  ): Promise<InvoiceAgingRow[]> {
    this.assertAllowed(user);
    return this.aging.listInvoiceAging({
      asOf: parseAsOf(asOf),
      customerId: customerId?.trim() || undefined,
    });
  }

  private assertAllowed(user: JwtUser): void {
    const role = (user.role ?? '').trim().toUpperCase();
    if (!ALLOWED_ROLES.has(role)) {
      throw new ForbiddenException(
        'Aging report is restricted to Owner / Accountant / GM / CC Supervisor',
      );
    }
  }
}

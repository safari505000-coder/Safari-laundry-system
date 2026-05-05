import { Injectable, NotFoundException } from '@nestjs/common';
import { SafariRole } from '@prisma/client';
import type { CustomerCoreRow } from './customer-core.service';
import { DebtService } from '../finance/services/debt.service';
import { SubscriptionService } from '../finance/services/subscription.service';
import { CustomerCoreService } from './customer-core.service';
import type {
  CustomerFinancialDTO,
  CustomerInternalDTO,
  CustomerPublicDTO,
} from './dto/customer-access.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

const SENSITIVE_CUSTOMER_FINANCE_ROLES = new Set<SafariRole>([
  SafariRole.OWNER,
  SafariRole.GENERAL_MANAGER,
  SafariRole.CALL_CENTER,
  SafariRole.CALL_CENTER_SUPERVISOR,
  SafariRole.ACCOUNTANT,
]);

@Injectable()
export class CustomersService {
  constructor(
    private readonly core: CustomerCoreService,
    private readonly debt: DebtService,
    private readonly subscription: SubscriptionService,
  ) {}

  /**
   * 🔒 SECURITY LOCK - DO NOT MODIFY
   * Unauthorized roles must NEVER access collections or WhatsApp tools.
   */
  async list(query?: string, role?: SafariRole | string): Promise<CustomerInternalDTO[]> {
    const q = (query ?? '').trim();
    const isNumeric = /^[0-9]+$/.test(q);
    const canSeeFinancials = this.canSeeFinancials(role);
    const customers =
      isNumeric && q.length >= 2
        ? await this.core.listByPhonePriority(q)
        : await this.core.list(q);
    if (!canSeeFinancials) {
      return customers.map((customer) => this.toPublicDto(customer));
    }
    const snapshots = await Promise.all(
      customers.map(async (customer): Promise<CustomerFinancialDTO> => {
        const [debt, subscription] = await Promise.all([
          this.debt.getCustomerDebtSnapshot(customer.id),
          this.subscription.getCustomerSubscriptionSnapshot(customer.id),
        ]);
        return this.toFinancialDto(customer, debt, subscription);
      }),
    );
    return snapshots;
  }

  async update(id: string, dto: UpdateCustomerDto): Promise<CustomerCoreRow> {
    return this.core.update(id, dto);
  }

  /**
   * CTI / PBX handoff — match `phone` or `phone2` using Kuwait digit variants.
   * Returns at most one customer unless several rows match (ambiguous).
   */
  async resolveIncomingPhone(raw: string): Promise<{
    customer: CustomerCoreRow | null;
    ambiguous: boolean;
    searchHint: string;
  }> {
    const rows = await this.core.findByIncomingPhoneRaw(raw);
    const hintTerms = this.core.incomingPhoneSearchTerms(raw);
    const searchHint = hintTerms.sort((a, b) => b.length - a.length)[0] ?? '';
    if (rows.length === 0) {
      return { customer: null, ambiguous: false, searchHint };
    }
    const seen = new Map<string, CustomerCoreRow>();
    for (const r of rows) {
      seen.set(r.id, r);
    }
    const unique = [...seen.values()];
    if (unique.length === 1) {
      return { customer: unique[0]!, ambiguous: false, searchHint };
    }
    return { customer: null, ambiguous: true, searchHint };
  }

  async createQuick(dto: {
    displayName: string;
    phone: string;
  }): Promise<CustomerCoreRow> {
    return this.core.createQuickCustomer(dto.displayName, dto.phone);
  }

  async getProfileWithFinancials(
    customerId: string,
    role?: SafariRole | string,
  ): Promise<CustomerInternalDTO> {
    const canSeeFinancials = this.canSeeFinancials(role);
    const customer = await this.core.getById(customerId);
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    if (!canSeeFinancials) {
      return this.toPublicDto(customer);
    }
    const [debt, subscription] = await Promise.all([
      this.debt.getCustomerDebtSnapshot(customerId),
      this.subscription.getCustomerSubscriptionSnapshot(customerId),
    ]);
    return this.toFinancialDto(customer, debt, subscription);
  }

  private canSeeFinancials(role?: SafariRole | string): boolean {
    return !!role && SENSITIVE_CUSTOMER_FINANCE_ROLES.has(role as SafariRole);
  }

  private toPublicDto(customer: CustomerCoreRow): CustomerPublicDTO {
    return { customer };
  }

  private toFinancialDto(
    customer: CustomerCoreRow,
    debt: Awaited<ReturnType<DebtService['getCustomerDebtSnapshot']>>,
    subscription: Awaited<ReturnType<SubscriptionService['getCustomerSubscriptionSnapshot']>>,
  ): CustomerFinancialDTO {
    return { customer, debt, subscription };
  }
}

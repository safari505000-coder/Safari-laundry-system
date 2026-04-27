import { Injectable, NotFoundException } from '@nestjs/common';
import type { CustomerCoreRow } from './customer-core.service';
import { DebtService } from '../finance/services/debt.service';
import { SubscriptionService } from '../finance/services/subscription.service';
import { CustomerCoreService } from './customer-core.service';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(
    private readonly core: CustomerCoreService,
    private readonly debt: DebtService,
    private readonly subscription: SubscriptionService,
  ) {}

  async list(query?: string): Promise<
    Array<{
      customer: CustomerCoreRow;
      debt: Awaited<ReturnType<DebtService['getCustomerDebtSnapshot']>>;
      subscription: Awaited<
        ReturnType<SubscriptionService['getCustomerSubscriptionSnapshot']>
      >;
    }>
  > {
    const q = (query ?? '').trim();
    const isNumeric = /^[0-9]+$/.test(q);
    const customers =
      isNumeric && q.length >= 2
        ? await this.core.listByPhonePriority(q)
        : await this.core.list(q);
    const snapshots = await Promise.all(
      customers.map(async (customer) => {
        const [debt, subscription] = await Promise.all([
          this.debt.getCustomerDebtSnapshot(customer.id),
          this.subscription.getCustomerSubscriptionSnapshot(customer.id),
        ]);
        return {
          customer,
          debt,
          subscription,
        };
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

  async getProfileWithFinancials(customerId: string): Promise<{
    customer: CustomerCoreRow;
    debt: Awaited<ReturnType<DebtService['getCustomerDebtSnapshot']>>;
    subscription: Awaited<ReturnType<SubscriptionService['getCustomerSubscriptionSnapshot']>>;
  }> {
    const customer = await this.core.getById(customerId);
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    const [debt, subscription] = await Promise.all([
      this.debt.getCustomerDebtSnapshot(customerId),
      this.subscription.getCustomerSubscriptionSnapshot(customerId),
    ]);
    return { customer, debt, subscription };
  }
}

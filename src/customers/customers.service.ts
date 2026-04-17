import { Injectable, NotFoundException } from '@nestjs/common';
import { DebtService } from '../finance/services/debt.service';
import { SubscriptionService } from '../finance/services/subscription.service';
import { CustomerCoreService } from './customer-core.service';
import type { CustomerCoreRow } from './customer-core.service';
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

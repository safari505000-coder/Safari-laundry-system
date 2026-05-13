import { CashStatus, OrderStatus, PosPaymentMethod } from '@prisma/client';
import { DebtSource } from '../finance/enums/debt-source.enum';
import { computeCustomerFinancials } from './customer-360-financials';

describe('computeCustomerFinancials', () => {
  it('returns zero due when a 0.5 KWD invoice is fully paid', () => {
    const fin = computeCustomerFinancials({
      orders: [
        {
          id: 'paid-order',
          status: OrderStatus.COMPLETED,
          totalPrice: '0.5000',
          cashStatus: CashStatus.PAID_TO_DRIVER,
          posPaymentMethod: PosPaymentMethod.KNET,
          paymentSource: 'KNET',
        },
      ],
      debtLedger: [],
      subscription: null,
    });

    expect(fin.totalInvoicesKd).toBe('0.5000');
    expect(fin.totalPaymentsKd).toBe('0.5000');
    expect(fin.totalDueKd).toBe('0.0000');
    expect(fin.subscription.remaining).toBe('0.0000');
    expect(fin.subscriptionRemainingKd).toBe('0.0000');
  });

  it('returns full due when a 1.0 KWD invoice has no payment', () => {
    const fin = computeCustomerFinancials({
      orders: [
        {
          status: OrderStatus.PENDING,
          totalPrice: '1.0000',
          cashStatus: CashStatus.UNPAID,
          posPaymentMethod: PosPaymentMethod.ONLINE,
          paymentSource: 'ONLINE',
        },
      ],
      debtLedger: [],
      subscription: { planActualBalanceSnapshot: '0.0000' },
    });

    expect(fin.totalInvoicesKd).toBe('1.0000');
    expect(fin.totalPaymentsKd).toBe('0.0000');
    expect(fin.totalDueKd).toBe('1.0000');
  });

  it('returns partial due when a 1.0 KWD invoice has a 0.5 KWD payment', () => {
    const fin = computeCustomerFinancials({
      orders: [
        {
          id: 'partial-order',
          status: OrderStatus.COMPLETED,
          totalPrice: '1.0000',
          cashStatus: CashStatus.UNPAID,
          posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
          paymentSource: 'WALLET',
        },
      ],
      debtLedger: [
        { orderId: 'partial-order', source: DebtSource.PAYMENT, amount: '0.5000' },
      ],
      subscription: null,
    });

    expect(fin.totalInvoicesKd).toBe('1.0000');
    expect(fin.totalPaymentsKd).toBe('0.5000');
    expect(fin.totalDueKd).toBe('0.5000');
  });

  it('shows subscription activation debt settlement as consumed subscription credit', () => {
    const fin = computeCustomerFinancials({
      orders: [
        {
          id: 'debt-order',
          status: OrderStatus.COMPLETED,
          totalPrice: '30.2500',
          cashStatus: CashStatus.UNPAID,
          posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
          paymentSource: 'WALLET',
        },
      ],
      debtLedger: [
        {
          orderId: 'debt-order',
          source: DebtSource.INVOICE_SHORTFALL,
          amount: '30.2500',
        },
        {
          orderId: 'debt-order',
          source: DebtSource.PAYMENT,
          amount: '25.0000',
        },
      ],
      subscription: {
        id: 'sub-convert',
        planActualBalanceSnapshot: '25.0000',
        activatedAt: new Date('2026-05-01T00:00:00Z'),
      },
      activationDebtSettlements: [
        {
          id: 'activation-history',
          subscriptionId: 'sub-convert',
          amount: '25.0000',
          createdAt: new Date('2026-05-01T00:01:00Z'),
        },
      ],
    });

    expect(fin.totalInvoicesKd).toBe('30.2500');
    expect(fin.totalPaymentsKd).toBe('25.0000');
    expect(fin.totalDueKd).toBe('5.2500');
    expect(fin.subscription.consumed).toBe('25.0000');
    expect(fin.subscription.remaining).toBe('0.0000');
  });

  it('keeps subscription zeroed when the customer has no subscription', () => {
    const fin = computeCustomerFinancials({
      orders: [
        {
          status: OrderStatus.COMPLETED,
          totalPrice: '0.5000',
          cashStatus: CashStatus.PAID_ONLINE,
          posPaymentMethod: PosPaymentMethod.CASH,
          paymentSource: 'CASH',
        },
      ],
      debtLedger: [],
      subscription: null,
    });

    expect(fin.subscription.value).toBe('0.0000');
    expect(fin.subscription.consumed).toBe('0.0000');
    expect(fin.subscription.remaining).toBe('0.0000');
    expect(fin.subscriptionRemainingKd).toBe('0.0000');
  });

  it('only consumes subscription for orders paid by subscription wallet', () => {
    const fin = computeCustomerFinancials({
      orders: [
        {
          status: OrderStatus.COMPLETED,
          totalPrice: '3.0000',
          cashStatus: CashStatus.PAID_ONLINE,
          posPaymentMethod: PosPaymentMethod.SUBSCRIPTION_WALLET,
          paymentSource: 'SUBSCRIPTION',
          subscriptionId: 'sub-1',
        },
        {
          status: OrderStatus.COMPLETED,
          totalPrice: '2.0000',
          cashStatus: CashStatus.PAID_ONLINE,
          posPaymentMethod: PosPaymentMethod.KNET,
          paymentSource: 'KNET',
          subscriptionId: 'sub-1',
        },
      ],
      debtLedger: [],
      subscription: {
        id: 'sub-1',
        planActualBalanceSnapshot: '10.0000',
      },
    });

    expect(fin.subscription.value).toBe('10.0000');
    expect(fin.subscription.consumed).toBe('3.0000');
    expect(fin.subscription.remaining).toBe('7.0000');
  });

  it('keeps cash and debt payments out of subscription consumption in mixed flows', () => {
    const fin = computeCustomerFinancials({
      orders: [
        {
          id: 'sub-order',
          status: OrderStatus.COMPLETED,
          totalPrice: '3.0000',
          cashStatus: CashStatus.PAID_ONLINE,
          posPaymentMethod: PosPaymentMethod.SUBSCRIPTION_WALLET,
          paymentSource: 'SUBSCRIPTION',
          subscriptionId: 'sub-1',
        },
        {
          id: 'cash-order',
          status: OrderStatus.COMPLETED,
          totalPrice: '2.0000',
          cashStatus: CashStatus.PAID_TO_DRIVER,
          posPaymentMethod: PosPaymentMethod.CASH,
          paymentSource: 'CASH',
        },
        {
          id: 'debt-order',
          status: OrderStatus.COMPLETED,
          totalPrice: '1.0000',
          cashStatus: CashStatus.UNPAID,
          posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
          paymentSource: 'WALLET',
        },
      ],
      debtLedger: [{ orderId: 'debt-order', source: DebtSource.PAYMENT, amount: '0.5000' }],
      subscription: {
        id: 'sub-1',
        planActualBalanceSnapshot: '10.0000',
      },
    });

    expect(fin.totalInvoicesKd).toBe('6.0000');
    expect(fin.totalPaymentsKd).toBe('5.5000');
    expect(fin.totalDueKd).toBe('0.5000');
    expect(fin.subscription.value).toBe('10.0000');
    expect(fin.subscription.consumed).toBe('3.0000');
    expect(fin.subscription.remaining).toBe('7.0000');
  });

  it('includes debt-ledger PAYMENT rows and treats amounts as positive', () => {
    const fin = computeCustomerFinancials({
      orders: [
        {
          status: OrderStatus.COMPLETED,
          totalPrice: '2.0000',
          cashStatus: CashStatus.PAID_TO_DRIVER,
          posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
          paymentSource: 'WALLET',
        },
      ],
      debtLedger: [
        { source: DebtSource.PAYMENT, amount: '0.7500' },
        { source: DebtSource.PAYMENT, amount: '-0.2500' },
      ],
      subscription: { planActualBalanceSnapshot: '0.0000' },
    });

    expect(fin.totalPaymentsKd).toBe('1.0000');
    expect(fin.totalDueKd).toBe('1.0000');
  });

  it('clamps overpayment due to zero and exposes a detection-only anomaly', () => {
    const fin = computeCustomerFinancials({
      orders: [
        {
          id: 'invoice-1',
          status: OrderStatus.COMPLETED,
          totalPrice: '1.0000',
          cashStatus: CashStatus.UNPAID,
          posPaymentMethod: PosPaymentMethod.ONLINE,
          paymentSource: 'ONLINE',
        },
      ],
      debtLedger: [{ source: DebtSource.PAYMENT, amount: '2.0000' }],
      subscription: null,
    });

    expect(fin.totalPaymentsKd).toBe('2.0000');
    expect(fin.totalDueKd).toBe('0.0000');
    expect(fin.overpaymentBalanceKd).toBe('1.0000');
    expect(fin.anomalyFlags).toContainEqual(
      expect.objectContaining({ type: 'OVERPAYMENT_DETECTED', amountKd: '1.0000' }),
    );
  });

  it('does not double count ledger payment for an order already marked paid', () => {
    const fin = computeCustomerFinancials({
      orders: [
        {
          id: 'order-paid',
          status: OrderStatus.COMPLETED,
          totalPrice: '1.0000',
          cashStatus: CashStatus.PAID_ONLINE,
          posPaymentMethod: PosPaymentMethod.KNET,
          paymentSource: 'KNET',
        },
      ],
      debtLedger: [
        { orderId: 'order-paid', source: DebtSource.PAYMENT, amount: '1.0000' },
      ],
      subscription: null,
    });

    expect(fin.totalInvoicesKd).toBe('1.0000');
    expect(fin.totalPaymentsKd).toBe('1.0000');
    expect(fin.totalDueKd).toBe('0.0000');
    expect(fin.anomalyFlags).toContainEqual(
      expect.objectContaining({ type: 'DOUBLE_COUNT_DETECTED', orderId: 'order-paid' }),
    );
  });

  it('flags non-subscription orders linked to an active subscription without affecting usage', () => {
    const fin = computeCustomerFinancials({
      orders: [
        {
          id: 'cash-linked-to-sub',
          status: OrderStatus.COMPLETED,
          totalPrice: '2.0000',
          cashStatus: CashStatus.PAID_TO_DRIVER,
          posPaymentMethod: PosPaymentMethod.CASH,
          paymentSource: 'CASH',
          subscriptionId: 'sub-1',
        },
      ],
      debtLedger: [],
      subscription: { id: 'sub-1', planActualBalanceSnapshot: '10.0000' },
    });

    expect(fin.subscription.consumed).toBe('0.0000');
    expect(fin.subscription.remaining).toBe('10.0000');
    expect(fin.anomalyFlags).toContainEqual(
      expect.objectContaining({
        type: 'SUBSCRIPTION_SOURCE_ANOMALY',
        orderId: 'cash-linked-to-sub',
      }),
    );
  });

  it('throws when an active order has no strict payment source', () => {
    expect(() =>
      computeCustomerFinancials({
        orders: [
          {
            id: 'bad-order',
            status: OrderStatus.COMPLETED,
            totalPrice: '1.0000',
            cashStatus: CashStatus.PAID_ONLINE,
            posPaymentMethod: PosPaymentMethod.KNET,
          },
        ],
        debtLedger: [],
        subscription: null,
      }),
    ).toThrow(/paymentSource/);
  });
});

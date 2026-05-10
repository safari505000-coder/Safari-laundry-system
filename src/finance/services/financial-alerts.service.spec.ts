import { FinancialAlertsService } from './financial-alerts.service';

describe('FinancialAlertsService', () => {
  it('centralizes high debt, driver delay, expense spike, and cash mismatch alerts', async () => {
    const driverRisk = {
      getRiskyDrivers: jest.fn(),
    };
    const service = new FinancialAlertsService(driverRisk as any);

    const alerts = await service.buildAlerts({
      topCustomers: [
        {
          customerId: 'customer-1',
          displayName: 'Customer One',
          // V23.2 — alerts now consume `canonicalDebtKd`. The
          // threshold (500 KWD) and message string are unchanged;
          // only the source field name changed to reflect the
          // canonical-banking single source of truth.
          canonicalDebtKd: '501.0000',
          totalInvoicesKd: '600.0000',
          totalPaymentsKd: '99.0000',
          customerHealth: 'RISK',
          paymentConsistency: 0.2,
          avgPaymentDelayHours: 12,
          lifetimeValueKd: '600.0000',
        },
      ],
      riskyDrivers: [
        {
          driverId: 'driver-1',
          driverName: 'Driver One',
          collectedCash: '5.0000',
          handedCash: '0.0000',
          delayHours: 49,
          riskLevel: 'HIGH',
        },
      ],
      reconciliationDifferenceKd: '2.0000',
      expenseCurrentKd: '15.0000',
      expensePreviousKd: '10.0000',
      now: new Date('2026-05-02T00:00:00.000Z'),
    });

    expect(alerts.map((alert) => alert.type)).toEqual(
      expect.arrayContaining([
        'HIGH_DEBT',
        'DRIVER_DELAY',
        'CASH_MISMATCH',
        'EXPENSE_SPIKE',
      ]),
    );
  });
});

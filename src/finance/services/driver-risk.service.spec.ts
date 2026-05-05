import { Prisma } from '@prisma/client';
import { DriverRiskService } from './driver-risk.service';

describe('DriverRiskService', () => {
  function serviceWith(completedAt: Date, handed = '0.0000') {
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'driver-1', fullName: 'Driver One', username: 'driver1' },
        ]),
      },
      order: {
        findMany: jest.fn().mockResolvedValue([
          { totalPrice: new Prisma.Decimal('5.0000'), completedAt },
        ]),
      },
      managerCashCustody: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { amountKd: new Prisma.Decimal(handed) },
        }),
      },
    };
    return new DriverRiskService(prisma as any);
  }

  it('marks delay over 24 hours as MEDIUM', async () => {
    const service = serviceWith(new Date(Date.now() - 25 * 3600000), '5.0000');

    const rows = await service.getRiskyDrivers();

    expect(rows[0]).toMatchObject({ driverId: 'driver-1', riskLevel: 'MEDIUM' });
  });

  it('marks delay over 48 hours as HIGH', async () => {
    const service = serviceWith(new Date(Date.now() - 49 * 3600000), '5.0000');

    const rows = await service.getRiskyDrivers();

    expect(rows[0]).toMatchObject({ driverId: 'driver-1', riskLevel: 'HIGH' });
  });

  it('marks handed less than collected as WARNING', async () => {
    const service = serviceWith(new Date(), '1.0000');

    const rows = await service.getRiskyDrivers();

    expect(rows[0]).toMatchObject({ driverId: 'driver-1', riskLevel: 'WARNING' });
  });
});

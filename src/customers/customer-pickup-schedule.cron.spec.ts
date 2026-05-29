import { CustomerPickupScheduleCron } from './customer-pickup-schedule.cron';
import { OrderStatus, ServiceType, PosPaymentMethod } from '@prisma/client';

describe('CustomerPickupScheduleCron', () => {
  let cron: CustomerPickupScheduleCron;
  let prisma: any;
  let notifications: any;

  beforeEach(() => {
    prisma = {
      customerPickupSchedule: {
        findMany: jest.fn(),
      },
      customerSubscription: {
        findFirst: jest.fn(),
      },
      order: {
        create: jest.fn(),
      },
    };
    notifications = {
      sendCustomerPlainWhatsApp: jest.fn().mockResolvedValue(undefined),
    };
    cron = new CustomerPickupScheduleCron(prisma as any, notifications as any);
  });

  it('skips when no schedules are active', async () => {
    prisma.customerPickupSchedule.findMany.mockResolvedValue([]);
    await cron.handleCron();
    expect(prisma.order.create).not.toHaveBeenCalled();
    expect(notifications.sendCustomerPlainWhatsApp).not.toHaveBeenCalled();
  });

  it('skips schedule when customer subscription is not active', async () => {
    prisma.customerPickupSchedule.findMany.mockResolvedValue([
      {
        id: 'sch-1',
        dayOfWeek: 1,
        timeWindow: '18:00-20:00',
        customerId: 'cust-1',
        customer: {
          id: 'cust-1',
          phone: '96512345678',
          displayName: 'Test Customer',
        },
      },
    ]);
    prisma.customerSubscription.findFirst.mockResolvedValue(null);

    await cron.handleCron();

    expect(prisma.order.create).not.toHaveBeenCalled();
    expect(notifications.sendCustomerPlainWhatsApp).not.toHaveBeenCalled();
  });

  it('creates order and sends WhatsApp when active schedule and subscription exists', async () => {
    const mockSchedule = {
      id: 'sch-1',
      dayOfWeek: new Date().getUTCDay(),
      timeWindow: '18:00-20:00',
      customerId: 'cust-1',
      customer: {
        id: 'cust-1',
        phone: '96512345678',
        displayName: 'Test Customer',
      },
    };
    prisma.customerPickupSchedule.findMany.mockResolvedValue([mockSchedule]);
    prisma.customerSubscription.findFirst.mockResolvedValue({
      id: 'sub-1',
      status: 'ACTIVE',
    });
    prisma.order.create.mockResolvedValue({
      id: 'order-1',
    });

    await cron.handleCron();

    expect(prisma.order.create).toHaveBeenCalledWith({
      data: {
        customerId: 'cust-1',
        status: OrderStatus.PENDING,
        serviceType: ServiceType.NORMAL,
        totalPrice: 0,
        posPaymentMethod: PosPaymentMethod.SUBSCRIPTION_WALLET,
        notes: `الجدولة الذكية للاشتراكات: جمع تلقائي أسبوعي (18:00-20:00)`,
      },
    });
    expect(notifications.sendCustomerPlainWhatsApp).toHaveBeenCalledWith(
      '96512345678',
      expect.stringContaining('Test Customer'),
    );
  });
});

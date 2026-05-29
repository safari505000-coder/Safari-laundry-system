import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { KUWAIT_TIMEZONE, KUWAIT_OFFSET_MIN } from '../common/time/kuwait-time';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerNotificationsService } from '../customer-notifications/customer-notifications.service';
import { OrderStatus, ServiceType, PosPaymentMethod } from '@prisma/client';

@Injectable()
export class CustomerPickupScheduleCron {
  private readonly logger = new Logger(CustomerPickupScheduleCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: CustomerNotificationsService,
  ) {}

  @Cron('1 0 * * *', {
    name: 'customer-pickup-schedule-cron',
    timeZone: KUWAIT_TIMEZONE,
  })
  async handleCron(): Promise<void> {
    this.logger.log('Starting daily recurring scheduled pickups check...');
    try {
      const now = new Date();
      const kuwaitTime = new Date(now.getTime() + KUWAIT_OFFSET_MIN * 60_000);
      const dayOfWeek = kuwaitTime.getUTCDay();

      // Find all active schedules for today
      const schedules = await this.prisma.customerPickupSchedule.findMany({
        where: {
          dayOfWeek,
          isActive: true,
        },
        include: {
          customer: {
            include: {
              wallet: true,
            },
          },
        },
      });

      this.logger.log(`Found ${schedules.length} schedules active for day of week ${dayOfWeek}.`);

      for (const schedule of schedules) {
        try {
          const customer = schedule.customer;
          if (!customer) continue;

          // Verify customer has active subscription
          const nowUtc = new Date();
          const activeSub = await this.prisma.customerSubscription.findFirst({
            where: {
              customerId: customer.id,
              status: 'ACTIVE',
              expiresAt: { gt: nowUtc },
            },
          });

          if (!activeSub) {
            this.logger.log(
              `Skipping scheduled pickup for customer ${customer.id}: no active subscription found.`,
            );
            continue;
          }

          // Create pending order for pickup
          const order = await this.prisma.order.create({
            data: {
              customerId: customer.id,
              status: OrderStatus.PENDING,
              serviceType: ServiceType.NORMAL,
              totalPrice: 0,
              posPaymentMethod: PosPaymentMethod.SUBSCRIPTION_WALLET,
              notes: `الجدولة الذكية للاشتراكات: جمع تلقائي أسبوعي (${schedule.timeWindow})`,
            },
          });

          this.logger.log(
            `Created order ${order.id} for scheduled pickup (customer: ${customer.id}).`,
          );

          // Send WhatsApp confirmation
          const phone = customer.phone;
          const msg = `مرحباً ${customer.displayName || 'عميلنا العزيز'}، تم جدولة موعد جمع الملابس الخاص بك اليوم تلقائياً بناءً على جدولك الأسبوعي (${schedule.timeWindow}). سيتواصل معك السائق قريباً.`;
          await this.notifications.sendCustomerPlainWhatsApp(phone, msg);
          this.logger.log(`Sent scheduled pickup WhatsApp notification to customer ${customer.id}.`);
        } catch (itemErr) {
          this.logger.error(
            `Failed to process pickup schedule ID ${schedule.id}: ${itemErr instanceof Error ? itemErr.message : String(itemErr)}`,
          );
        }
      }
    } catch (err) {
      this.logger.error(
        'Recurring pickup schedules cron failed',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}

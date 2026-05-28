import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DeliveryReturnReason,
  DeliveryStatus,
  OrderStatus,
  SafariRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ExpoPushService } from '../public-api/expo-push.service';
import { notifyCustomerDeliveryStatusChange } from '../public-api/order-delivery-push.service';
import { assertDeliveryStatusTransition } from './delivery-status.machine';
import type { ReturnToBranchDto } from './dto/return-to-branch.dto';
import type { OrderDetail } from './orders.service';
import { orderDetailSelect } from './orders.service';

export type OrderDeliveryTimelineEvent = {
  id: string;
  fromStatus: DeliveryStatus;
  toStatus: DeliveryStatus;
  returnReason: DeliveryReturnReason | null;
  notes: string | null;
  createdAt: string;
  actorName: string | null;
};

export type OrderDeliveryTracking = {
  orderId: string;
  invoiceLabel: string;
  deliveryStatus: DeliveryStatus;
  deliveryStartedAt: string | null;
  deliveredAt: string | null;
  returnedAt: string | null;
  deliveryReturnReason: DeliveryReturnReason | null;
  timeline: OrderDeliveryTimelineEvent[];
};

@Injectable()
export class OrderDeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly expoPush: ExpoPushService,
  ) {}

  async startDelivery(orderId: string, actorUserId: string, role: string) {
    return this.transition(orderId, actorUserId, role, {
      next: DeliveryStatus.OUT_FOR_DELIVERY,
      onApply: (now) => ({
        deliveryStartedAt: now,
        deliveryDriverId: actorUserId,
        driverId: undefined as string | undefined,
      }),
      assignDriverIfUnset: true,
    });
  }

  async completeDelivery(orderId: string, actorUserId: string, role: string) {
    return this.transition(orderId, actorUserId, role, {
      next: DeliveryStatus.DELIVERED,
      onApply: (now) => ({ deliveredAt: now }),
    });
  }

  async returnToBranch(
    orderId: string,
    actorUserId: string,
    role: string,
    dto: ReturnToBranchDto,
  ) {
    return this.transition(orderId, actorUserId, role, {
      next: DeliveryStatus.RETURNED_TO_BRANCH,
      returnReason: dto.reason,
      notes: dto.notes?.trim() || null,
      onApply: (now) => ({
        returnedAt: now,
        deliveryReturnReason: dto.reason,
      }),
    });
  }

  async getDeliveryTrackingForCustomer(
    orderId: string,
    customerId: string,
  ): Promise<OrderDeliveryTracking> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId },
      select: {
        id: true,
        serialNumber: true,
        invoiceNumber: true,
        deliveryStatus: true,
        deliveryStartedAt: true,
        deliveredAt: true,
        returnedAt: true,
        deliveryReturnReason: true,
        deliveryEvents: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            fromStatus: true,
            toStatus: true,
            returnReason: true,
            notes: true,
            createdAt: true,
            actor: { select: { fullName: true } },
          },
        },
      },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return this.mapTracking(order);
  }

  private mapTracking(order: {
    id: string;
    serialNumber: string | null;
    invoiceNumber: string | null;
    deliveryStatus: DeliveryStatus;
    deliveryStartedAt: Date | null;
    deliveredAt: Date | null;
    returnedAt: Date | null;
    deliveryReturnReason: DeliveryReturnReason | null;
    deliveryEvents: Array<{
      id: string;
      fromStatus: DeliveryStatus;
      toStatus: DeliveryStatus;
      returnReason: DeliveryReturnReason | null;
      notes: string | null;
      createdAt: Date;
      actor: { fullName: string | null };
    }>;
  }): OrderDeliveryTracking {
    const invoiceLabel =
      order.serialNumber?.trim() ||
      order.invoiceNumber?.trim() ||
      order.id.slice(0, 8).toUpperCase();
    return {
      orderId: order.id,
      invoiceLabel,
      deliveryStatus: order.deliveryStatus,
      deliveryStartedAt: order.deliveryStartedAt?.toISOString() ?? null,
      deliveredAt: order.deliveredAt?.toISOString() ?? null,
      returnedAt: order.returnedAt?.toISOString() ?? null,
      deliveryReturnReason: order.deliveryReturnReason,
      timeline: order.deliveryEvents.map((event) => ({
        id: event.id,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        returnReason: event.returnReason,
        notes: event.notes,
        createdAt: event.createdAt.toISOString(),
        actorName: event.actor.fullName,
      })),
    };
  }

  private async transition(
    orderId: string,
    actorUserId: string,
    role: string,
    options: {
      next: DeliveryStatus;
      returnReason?: DeliveryReturnReason;
      notes?: string | null;
      assignDriverIfUnset?: boolean;
      onApply: (now: Date) => {
        deliveryStartedAt?: Date;
        deliveredAt?: Date;
        returnedAt?: Date;
        deliveryReturnReason?: DeliveryReturnReason;
        deliveryDriverId?: string;
      };
    },
  ): Promise<OrderDetail> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        deliveryStatus: true,
        driverId: true,
        deliveryDriverId: true,
        serialNumber: true,
        invoiceNumber: true,
        customerId: true,
        customer: { select: { expoPushToken: true } },
      },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.status === OrderStatus.CANCELED) {
      throw new ForbiddenException('Canceled orders cannot enter delivery flow');
    }
    this.assertActorCanManageDelivery(order, actorUserId, role);

    const fromStatus = order.deliveryStatus;
    assertDeliveryStatusTransition(fromStatus, options.next);

    const now = new Date();
    const patch = options.onApply(now);

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: {
          deliveryStatus: options.next,
          ...(patch.deliveryStartedAt
            ? { deliveryStartedAt: patch.deliveryStartedAt }
            : {}),
          ...(patch.deliveredAt ? { deliveredAt: patch.deliveredAt } : {}),
          ...(patch.returnedAt ? { returnedAt: patch.returnedAt } : {}),
          ...(patch.deliveryReturnReason
            ? { deliveryReturnReason: patch.deliveryReturnReason }
            : {}),
          ...(patch.deliveryDriverId
            ? { deliveryDriverId: patch.deliveryDriverId }
            : {}),
          ...(options.assignDriverIfUnset && !order.driverId
            ? { driverId: actorUserId }
            : {}),
        },
      });
      await tx.orderDeliveryEvent.create({
        data: {
          orderId,
          actorUserId,
          fromStatus,
          toStatus: options.next,
          returnReason: options.returnReason ?? null,
          notes: options.notes ?? null,
        },
      });
    });

    const invoiceLabel =
      order.serialNumber?.trim() ||
      order.invoiceNumber?.trim() ||
      order.id.slice(0, 8).toUpperCase();

    void notifyCustomerDeliveryStatusChange(this.expoPush, options.next, {
      orderId,
      invoiceLabel,
      customerExpoPushToken: order.customer.expoPushToken,
    }).catch(() => undefined);

    return this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: orderDetailSelect,
    });
  }

  private assertActorCanManageDelivery(
    order: {
      driverId: string | null;
      deliveryDriverId: string | null;
    },
    actorUserId: string,
    role: string,
  ): void {
    if (role === SafariRole.MANAGER || role === SafariRole.SUPERVISOR) {
      return;
    }
    if (role !== SafariRole.DRIVER) {
      throw new ForbiddenException('Only drivers and managers can update delivery status');
    }
    const ownsOrder =
      order.driverId === actorUserId ||
      order.deliveryDriverId === actorUserId ||
      order.driverId == null;
    if (!ownsOrder) {
      throw new ForbiddenException(
        'You may only update delivery for orders assigned to you',
      );
    }
  }
}

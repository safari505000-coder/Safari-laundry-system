import { DeliveryStatus } from '@prisma/client';
import { orderDeliveryStatusPushCopy } from './order-delivery-push-copy';
import { ExpoPushService } from './expo-push.service';

export type OrderDeliveryPushContext = {
  orderId: string;
  invoiceLabel: string;
  customerExpoPushToken: string | null;
};

export async function notifyCustomerDeliveryStatusChange(
  expoPush: ExpoPushService,
  toStatus: DeliveryStatus,
  ctx: OrderDeliveryPushContext,
): Promise<void> {
  const copy = orderDeliveryStatusPushCopy(toStatus, ctx.invoiceLabel);
  if (!copy) {
    return;
  }
  await expoPush.sendToToken(ctx.customerExpoPushToken, {
    title: copy.title,
    body: copy.body,
    data: {
      screen: 'order',
      orderId: ctx.orderId,
      deliveryStatus: toStatus,
    },
  });
}

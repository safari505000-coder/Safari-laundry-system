import { router, type Href } from 'expo-router';

export function openOrderDeliveryTrack(orderId: string): void {
  router.push(`/order/${orderId}` as Href);
}

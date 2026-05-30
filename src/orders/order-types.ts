import type { Prisma } from '@prisma/client';
import type { CreatePaymentLinkResult } from '../common/services/payments.service';
import type { PrismaService } from '../prisma/prisma.service';
import { orderDetailSelect } from './order-selects';

export type PosServiceKey = 'NORMAL' | 'URGENT' | 'PRESS_ONLY' | 'URGENT_PRESS';

export type PosPricedLineCreate = {
  label: string | null;
  starchOption: 'NONE';
  quantity: string;
  unitPrice: string;
  stockItemId: string | null;
};

export type OrderDetail = Prisma.OrderGetPayload<{
  select: typeof orderDetailSelect;
}>;

/** V19.26 — set on `GET /api/orders` when any supervisor EDIT row exists. */
export type OrderDetailWithListFlags = OrderDetail & {
  hasSupervisorEdit: boolean;
};

/** POS checkout may attach a hosted payment URL when using ONLINE. */
export type PosCheckoutOrderDetail = OrderDetail & {
  paymentLink?: CreatePaymentLinkResult;
};

/** Multi-invoice POS: one gateway session for several orders. */
export type PosCheckoutBundleResult = {
  bundleId: string;
  orders: OrderDetail[];
  paymentLink: CreatePaymentLinkResult;
};

/** Prisma client outside or inside `$transaction`. */
export type PrismaOrderDb = PrismaService | Prisma.TransactionClient;

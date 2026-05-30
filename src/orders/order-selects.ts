import { Prisma } from '@prisma/client';

export const orderDetailSelect = {
  id: true,
  status: true,
  serviceType: true,
  totalPrice: true,
  cashStatus: true,
  posPaymentMethod: true,
  completedAt: true,
  walletSettledAt: true,
  invoiceNumber: true,
  serialNumber: true,
  notes: true,
  reminderCount: true,
  lastReminderAt: true,
  dispatchId: true,
  deliveryStatus: true,
  deliveryStartedAt: true,
  deliveredAt: true,
  returnedAt: true,
  deliveryReturnReason: true,
  deliveryDriverId: true,
  createdAt: true,
  updatedAt: true,
  customer: {
    select: {
      id: true,
      phone: true,
      phone2: true,
      address: true,
      displayName: true,
      // V19.22 — surface outstanding wallet debt on invoice prints so the
      // customer (and driver handing over the receipt) immediately sees
      // any prior debt that is still owed. The print template hides the
      // line when debt is zero so zero-debt receipts keep the old layout.
      wallet: { select: { balance: true, debt: true } },
    },
  },
  driver: {
    select: {
      id: true,
      username: true,
      fullName: true,
      employeeId: true,
      jobTitle: true,
      phone: true,
      safariRole: true,
      // V19.9 — surface the issuing driver's branch so the Call-Center
      // "All Invoices" browser can render an aggregated table without
      // a secondary fetch. Any consumer that already destructures the
      // driver object is forward-compatible (extra property is additive).
      branch: { select: { id: true, name: true } },
    },
  },
  lineItems: {
    select: {
      id: true,
      label: true,
      starchOption: true,
      quantity: true,
      unitPrice: true,
    },
  },
} satisfies Prisma.OrderSelect;

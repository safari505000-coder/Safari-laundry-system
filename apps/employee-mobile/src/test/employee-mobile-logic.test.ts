import assert from 'node:assert/strict';
import { formatKwdLabel, sumKwdStrings } from '@/lib/kwd';
import type {
  CustomerBillingProfile,
  PosCartLine,
  PosCustomerRow,
  PosPaymentMethod,
} from '@/api/pos-types';
import {
  buildCheckoutRequest,
  buildSubOrderCheckoutRequest,
  createPrimarySubOrder,
  deliveryForSubOrder,
  grandTotalKd,
  VIP_LINE_LABEL_AR,
  VIP_SURCHARGE_KD,
  DELIVERY_LINE_LABEL_AR,
} from '@/lib/pos-pricing';
import {
  canUseSubscriptionPayment,
  paymentMethodLabelAr,
} from '@/lib/payment-methods';
import {
  isValidOrderId,
  normalizeScannedOrderId,
  extractScannedOrderReference,
} from '@/lib/order-scan';
import { pickOrderIdFromSearchResults } from '@/lib/order-search-match';
import type { OrderDetailRow } from '@/api/orders-types';
import {
  RETURN_REASON_OPTIONS,
  deliveryStatusLabelAr,
  returnReasonLabelAr,
  visibleDeliveryActions,
} from '@/lib/delivery-status';
import {
  RECEIPT_MAX_DATA_URL_LENGTH,
  receiptFitsPayloadLimit,
} from '@/lib/receipt-image';
import {
  getEventKindLabelAr,
  getPaymentMethodLabelAr,
  getSubscriptionStatusLabelAr,
  getSubscriptionStatusTone,
} from '@/lib/call-center';

function test(name: string, run: () => void) {
  run();
  console.log(`ok - ${name}`);
}

function billingProfile(
  subscriptionActive: boolean,
  remainingBalance: string,
): CustomerBillingProfile {
  return {
    subscriptionActive,
    remainingBalance,
    planType: null,
    debt: '0.0000',
    lastSubscriptionAt: null,
  };
}

test('KWD label always displays three decimals', () => {
  assert.equal(formatKwdLabel('2.5'), '2.500 د.ك');
  assert.equal(formatKwdLabel('2.5000'), '2.500 د.ك');
  assert.equal(formatKwdLabel('0.25'), '0.250 د.ك');
});

test('KWD string summing avoids floating point drift', () => {
  assert.equal(sumKwdStrings(['0.1000', '0.2000', '1.0050']), '1.305');
  assert.equal(sumKwdStrings(['2.500', '-0.250']), '2.250');
});

test('POS payment methods mirror backend field contract', () => {
  const methods: PosPaymentMethod[] = [
    'CASH',
    'KNET',
    'PAYMENT_LINK',
    'ONLINE',
    'DEBT_ON_ACCOUNT',
    'SUBSCRIPTION',
  ];
  assert.equal(methods.map(paymentMethodLabelAr).includes('اشتراك / من الرصيد'), true);
});

test('checkout request carries subscription and dispatch id to server', () => {
  const customer: PosCustomerRow = {
    id: 'customer-1',
    phone: ' 5123-4567 ',
    displayName: 'Test Customer',
    address: 'Kuwait',
    wallet: { balance: '10.0000', debt: '0.0000' },
  };
  const lines: PosCartLine[] = [
    {
      lineKey: 'line-1',
      laundryId: 'item-1',
      nameAr: 'ثوب',
      serviceKey: 'NORMAL',
      serviceLabel: 'غسيل عادي',
      unitPrice: 1.25,
      quantity: 2,
    },
  ];

  const request = buildCheckoutRequest(customer, lines, 'SUBSCRIPTION', 'dispatch-1');

  assert.equal(request.customerPhone, '51234567');
  assert.equal(request.posPaymentMethod, 'SUBSCRIPTION');
  assert.equal(request.dispatchId, 'dispatch-1');
  assert.equal(request.lineItems[0].laundryPriceListItemId, 'item-1');
  assert.equal(request.lineItems[1].label, DELIVERY_LINE_LABEL_AR);
});

test('VIP surcharge and free delivery on attached invoice match web payload', () => {
  const customer: PosCustomerRow = {
    id: 'customer-1',
    phone: '51234567',
    displayName: 'Test',
    address: null,
    wallet: null,
  };
  const primary = createPrimarySubOrder();
  primary.lines = [
    {
      lineKey: 'a',
      laundryId: 'item-1',
      nameAr: 'ثوب',
      serviceKey: 'NORMAL',
      serviceLabel: 'غسيل عادي',
      unitPrice: 2.0,
      quantity: 1,
    },
  ];
  primary.vipEnabled = true;
  const attached = createPrimarySubOrder();
  attached.kind = 'attached';
  attached.lines = [
    {
      lineKey: 'b',
      laundryId: 'item-2',
      nameAr: 'بنطلون',
      serviceKey: 'NORMAL',
      serviceLabel: 'غسيل عادي',
      unitPrice: 1.5,
      quantity: 1,
    },
  ];

  const primaryReq = buildSubOrderCheckoutRequest(customer, primary, {
    isFirstInSession: true,
    paymentMethod: 'CASH',
    subscriptionProfile: null,
  });
  const attachedReq = buildSubOrderCheckoutRequest(customer, attached, {
    isFirstInSession: false,
    paymentMethod: 'CASH',
    subscriptionProfile: null,
  });

  assert.equal(primaryReq.totalPrice, 2.0 + 0.25 + VIP_SURCHARGE_KD);
  assert.equal(
    primaryReq.lineItems.find((l) => l.label === VIP_LINE_LABEL_AR)?.unitPrice,
    VIP_SURCHARGE_KD,
  );
  assert.equal(attachedReq.totalPrice, 1.5);
  assert.equal(
    attachedReq.lineItems.find((l) => l.label === DELIVERY_LINE_LABEL_AR)
      ?.unitPrice,
    0,
  );
});

test('grand total sums multiple sub-orders with one delivery fee', () => {
  const primary = createPrimarySubOrder();
  primary.lines = [
    {
      lineKey: 'a',
      laundryId: 'x',
      nameAr: 'ثوب',
      serviceKey: 'NORMAL',
      serviceLabel: 'غسيل',
      unitPrice: 1,
      quantity: 2,
    },
  ];
  const attached = createPrimarySubOrder();
  attached.kind = 'attached';
  attached.lines = [
    {
      lineKey: 'b',
      laundryId: 'y',
      nameAr: 'قميص',
      serviceKey: 'NORMAL',
      serviceLabel: 'غسيل',
      unitPrice: 0.5,
      quantity: 1,
    },
  ];
  const total = grandTotalKd([primary, attached], 'CASH', null);
  assert.equal(total, 2 + 0.5 + 0.25);
});

test('attached invoice skips delivery when subscription wallet covers lines', () => {
  const delivery = deliveryForSubOrder({
    lineSum: 2,
    isFirstInSession: false,
    paymentMethod: 'SUBSCRIPTION',
    subscriptionProfile: billingProfile(true, '5.0000'),
  });
  assert.equal(delivery, 0);
});

test('subscription payment is gated by active wallet balance', () => {
  assert.equal(
    canUseSubscriptionPayment(billingProfile(true, '0.0010')),
    true,
  );
  assert.equal(
    canUseSubscriptionPayment(billingProfile(false, '10.0000')),
    false,
  );
  assert.equal(
    canUseSubscriptionPayment(billingProfile(true, '0.0000')),
    false,
  );
});

test('order id validation accepts UUID scan formats only', () => {
  assert.equal(
    isValidOrderId('a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
    true,
  );
  assert.equal(
    isValidOrderId(
      normalizeScannedOrderId('a1b2c3d4e5f67890abcdef1234567890'),
    ),
    true,
  );
  assert.equal(isValidOrderId(undefined), false);
  assert.equal(isValidOrderId(''), false);
  assert.equal(isValidOrderId('not-a-uuid'), false);
});

test('scan reference extracts UUID from rating QR URLs', () => {
  const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  assert.equal(
    extractScannedOrderReference(`https://erp.example/r/${id}`),
    id,
  );
  assert.equal(extractScannedOrderReference('D2-1045'), 'D2-1045');
});

test('serial search picks a single driver order match', () => {
  const rows: OrderDetailRow[] = [
    {
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      status: 'COMPLETED',
      totalPrice: '5.000',
      cashStatus: 'UNPAID',
      serialNumber: 'D2-1045',
      invoiceNumber: null,
      notes: null,
      createdAt: '2026-05-28T00:00:00.000Z',
      customer: {
        id: 'cust-1',
        phone: '51234567',
        displayName: 'Test',
        address: null,
      },
      driver: { id: 'drv-1', fullName: 'Driver' },
    },
  ];
  assert.equal(pickOrderIdFromSearchResults(rows, 'D2-1045'), rows[0].id);
});

test('receipt data URL guard stays under backend payload limit', () => {
  const smallReceipt = `data:image/jpeg;base64,${'a'.repeat(
    RECEIPT_MAX_DATA_URL_LENGTH - 100,
  )}`;
  const hugeReceipt = `data:image/jpeg;base64,${'a'.repeat(
    RECEIPT_MAX_DATA_URL_LENGTH,
  )}`;

  assert.equal(receiptFitsPayloadLimit(smallReceipt), true);
  assert.equal(receiptFitsPayloadLimit(hugeReceipt), false);
});

test('delivery action buttons follow server deliveryStatus', () => {
  assert.deepEqual(visibleDeliveryActions('READY'), ['start']);
  assert.deepEqual(visibleDeliveryActions('OUT_FOR_DELIVERY'), [
    'complete',
    'return',
  ]);
  assert.deepEqual(visibleDeliveryActions('RETURNED_TO_BRANCH'), ['start']);
  assert.deepEqual(visibleDeliveryActions('DELIVERED'), []);
  assert.equal(deliveryStatusLabelAr('OUT_FOR_DELIVERY'), 'جاري التوصيل');
  assert.equal(returnReasonLabelAr('NO_ANSWER'), 'العميل لم يرد');
  assert.equal(RETURN_REASON_OPTIONS.length, 4);
});

test('call center helper mappings translate event kinds and status values correctly', () => {
  assert.equal(getEventKindLabelAr('SUBSCRIPTION_ACTIVATION'), 'تفعيل اشتراك جديد');
  assert.equal(getEventKindLabelAr('PARTIAL_DEBT_PAYMENT'), 'سداد جزء من المديونية');
  assert.equal(getEventKindLabelAr('UNKNOWN_KIND'), 'UNKNOWN_KIND');

  assert.equal(getSubscriptionStatusLabelAr('ACTIVE'), 'نشط');
  assert.equal(getSubscriptionStatusLabelAr('CUT_OFF'), 'موقوف');

  assert.equal(getPaymentMethodLabelAr('CASH'), 'كاش');
  assert.equal(getPaymentMethodLabelAr('KNET'), 'كي نت');
  assert.equal(getPaymentMethodLabelAr('ONLINE'), 'أونلاين');
  assert.equal(getPaymentMethodLabelAr('PAYMENT_LINK'), 'رابط دفع');
  assert.equal(getPaymentMethodLabelAr('DEBT_ON_ACCOUNT'), 'على الحساب');
  assert.equal(getPaymentMethodLabelAr(null), 'غير محدد');

  assert.equal(getSubscriptionStatusTone('ACTIVE'), 'completed');
  assert.equal(getSubscriptionStatusTone('CUT_OFF'), 'warning');
  assert.equal(getSubscriptionStatusTone('CLOSED'), 'cancelled');
  assert.equal(getSubscriptionStatusTone('UNKNOWN'), 'neutral');
});

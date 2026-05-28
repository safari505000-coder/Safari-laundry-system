import assert from 'node:assert/strict';
import { formatKwdLabel, sumKwdStrings } from '@/lib/kwd';
import type { PosCartLine, PosCustomerRow, PosPaymentMethod } from '@/api/pos-types';
import { buildCheckoutRequest } from '@/lib/pos-pricing';
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
  RECEIPT_MAX_DATA_URL_LENGTH,
  receiptFitsPayloadLimit,
} from '@/lib/receipt-image';

function test(name: string, run: () => void) {
  run();
  console.log(`ok - ${name}`);
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
});

test('subscription payment is gated by active wallet balance', () => {
  assert.equal(
    canUseSubscriptionPayment({
      subscriptionActive: true,
      remainingBalance: '0.0010',
    }),
    true,
  );
  assert.equal(
    canUseSubscriptionPayment({
      subscriptionActive: false,
      remainingBalance: '10.0000',
    }),
    false,
  );
  assert.equal(
    canUseSubscriptionPayment({
      subscriptionActive: true,
      remainingBalance: '0.0000',
    }),
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

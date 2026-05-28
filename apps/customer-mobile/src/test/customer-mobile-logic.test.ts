import assert from 'node:assert/strict';
import { parsePersistedCartLines } from '@/cart/cart-persisted-lines';
import { estimateCartTotalKd } from '@/cart/cart-totals';
import { formatKwdLabel } from '@/lib/kwd';
import { validateOrderGuard, validateTrackPhoneQuery } from '@/order/order-guards';
import {
  deliveryStatusLabelAr,
  deliveryTimelineActiveIndex,
} from '@/lib/delivery-status';

function test(name: string, run: () => void) {
  run();
  console.log(`ok - ${name}`);
}

test('cart total uses normal prices by default', () => {
  assert.equal(
    estimateCartTotalKd([
      { quantity: 2, priceNormalKd: '1.250', priceExpressKd: '2.000' },
      { quantity: 1, priceNormalKd: '0.750', priceExpressKd: '1.000' },
    ]),
    '3.250',
  );
});

test('cart total can use express prices', () => {
  assert.equal(
    estimateCartTotalKd(
      [{ quantity: 2, priceNormalKd: '1.250', priceExpressKd: '2.000' }],
      'EXPRESS',
    ),
    '4.000',
  );
});

test('KWD label always displays three decimals', () => {
  assert.equal(formatKwdLabel('2.5'), '2.500 د.ك');
  assert.equal(formatKwdLabel('2.5000'), '2.500 د.ك');
  assert.equal(formatKwdLabel('0.25'), '0.250 د.ك');
});

test('order guard requires a valid phone', () => {
  assert.equal(
    validateOrderGuard({
      phone: '12',
      itemCount: 1,
      serviceMode: 'BRANCH',
      branch: 'سفاري الجهراء',
    }),
    'أدخل رقم جوال كويتي صحيح (يبدأ بـ 5 أو 6 أو 9).',
  );
});

test('order guard requires at least one item', () => {
  assert.equal(
    validateOrderGuard({
      phone: '99999999',
      itemCount: 0,
      serviceMode: 'BRANCH',
      branch: 'سفاري الجهراء',
    }),
    'اختر خدمة واحدة على الأقل قبل تأكيد الطلب.',
  );
});

test('order guard requires address and pickup window for courier', () => {
  assert.equal(
    validateOrderGuard({
      phone: '99999999',
      itemCount: 1,
      serviceMode: 'COURIER',
      pickupWindow: '4 م - 7 م',
    }),
    'أدخل عنوان الاستلام حتى يصل فريق سفاري بدقة.',
  );

  assert.equal(
    validateOrderGuard({
      phone: '99999999',
      itemCount: 1,
      serviceMode: 'COURIER',
      address: 'السالمية',
    }),
    'اختر فترة الاستلام المناسبة.',
  );
});

test('order guard accepts complete branch request', () => {
  assert.equal(
    validateOrderGuard({
      phone: '99999999',
      itemCount: 1,
      serviceMode: 'BRANCH',
      branch: 'سفاري الجهراء',
    }),
    null,
  );
});

test('order guard accepts complete courier request', () => {
  assert.equal(
    validateOrderGuard({
      phone: '99999999',
      itemCount: 1,
      serviceMode: 'COURIER',
      address: 'السالمية',
      pickupWindow: '4 م - 7 م',
    }),
    null,
  );
});

test('track query requires kuwait mobile', () => {
  assert.equal(validateTrackPhoneQuery('123'), 'أدخل رقم جوال كويتي صحيح (يبدأ بـ 5 أو 6 أو 9).');
  assert.equal(validateTrackPhoneQuery('51234567'), null);
});

test('persisted cart ignores invalid rows', () => {
  const parsed = parsePersistedCartLines(
    JSON.stringify([
      {
        serviceId: 'svc-1',
        label: 'قميص',
        quantity: 2,
        priceNormalKd: '1.000',
        priceExpressKd: '1.500',
      },
      { serviceId: '', quantity: 0 },
      'bad-row',
    ]),
  );
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.serviceId, 'svc-1');
});

test('delivery timeline highlights current ERP invoice status', () => {
  assert.equal(deliveryStatusLabelAr('OUT_FOR_DELIVERY'), 'في الطريق إليك');
  assert.equal(deliveryTimelineActiveIndex('READY'), 0);
  assert.equal(deliveryTimelineActiveIndex('DELIVERED'), 2);
  assert.equal(deliveryTimelineActiveIndex('RETURNED_TO_BRANCH'), 1);
});

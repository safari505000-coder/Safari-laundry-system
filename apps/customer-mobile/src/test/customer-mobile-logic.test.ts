import assert from 'node:assert/strict';
import { estimateCartTotalKd } from '@/cart/cart-totals';
import { formatKwdLabel } from '@/lib/kwd';
import { validateOrderGuard } from '@/order/order-guards';

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
    }),
    'أدخل رقم جوال كويتي صحيح لإكمال الطلب.',
  );
});

test('order guard requires at least one item', () => {
  assert.equal(
    validateOrderGuard({
      phone: '99999999',
      itemCount: 0,
      serviceMode: 'BRANCH',
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

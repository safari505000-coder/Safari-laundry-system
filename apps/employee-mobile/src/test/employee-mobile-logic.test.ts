import assert from 'node:assert/strict';
import { formatKwdLabel } from '@/lib/kwd';
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

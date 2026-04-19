/**
 * V8.5 — Dry-run: 10 synthetic card/KNET transactions against the bank-fee util.
 * Run: npx tsx scripts/dry-run-bank-fees.ts
 */
import { KnetCommissionRule, PosPaymentMethod } from '@prisma/client';
import { computeOrderBankFeeKd } from '../src/payment-method-fees/bank-fee.util';

const config = {
  knetFlatKd: '0.1000',
  knetPercentOfGross: '0.015',
  knetRule: KnetCommissionRule.HIGHER_OF_FLAT_AND_PERCENT,
  cardPercentOfGross: '0.025',
};

const samples: Array<{ gross: number; method: PosPaymentMethod; label: string }> = [
  { gross: 3.25, method: PosPaymentMethod.ONLINE, label: 'ONLINE 3.250' },
  { gross: 10.0, method: PosPaymentMethod.PAYMENT_LINK, label: 'PAYMENT_LINK 10.000' },
  { gross: 5.5, method: PosPaymentMethod.KNET, label: 'KNET 5.500 (expect max(0.1, 0.0825)=0.1)' },
  { gross: 20.0, method: PosPaymentMethod.KNET, label: 'KNET 20.000 (expect max(0.1, 0.3)=0.3)' },
  { gross: 1.0, method: PosPaymentMethod.CASH, label: 'CASH 1.000' },
  { gross: 50.0, method: PosPaymentMethod.SUBSCRIPTION_WALLET, label: 'WALLET 50' },
  { gross: 7.777, method: PosPaymentMethod.ONLINE, label: 'ONLINE 7.777' },
  { gross: 100.0, method: PosPaymentMethod.KNET, label: 'KNET 100 (pct wins)' },
  { gross: 0.5, method: PosPaymentMethod.PAYMENT_LINK, label: 'LINK 0.500' },
  { gross: 42.0, method: PosPaymentMethod.DEBT_ON_ACCOUNT, label: 'DEBT 42' },
];

console.log('V8.5 bank fee dry-run (defaults: KNET max(0.100, 1.5%); card 2.5%)\n');

for (const s of samples) {
  const fee = computeOrderBankFeeKd(s.gross, s.method, config);
  const settled = Number((s.gross - Number(fee.toString())).toFixed(4));
  console.log(
    `${s.label.padEnd(42)} fee=${fee.toFixed(4)} KD  settled=${settled.toFixed(4)} KD`,
  );
}

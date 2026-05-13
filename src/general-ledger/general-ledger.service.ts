import { Injectable } from '@nestjs/common';
import { GeneralLedgerEntryType, Prisma } from '@prisma/client';

/**
 * مدخلات كتابة سجل في دفتر الأستاذ العام القديم (`GeneralLedgerEntry`).
 * يُستخدم في مسارات V4 التي لم تُرحَّل بعد إلى `DoubleEntryJournalService`.
 *
 * Input for writing a legacy general-ledger entry (`GeneralLedgerEntry`).
 * Used by V4-era flows not yet migrated to `DoubleEntryJournalService`.
 *
 * @since V4
 */
export type AppendLedgerInput = {
  entryType: GeneralLedgerEntryType;
  amount: Prisma.Decimal | string | number;
  memo?: string | null;
  metadata?: Prisma.InputJsonValue;
  customerId?: string | null;
  orderId?: string | null;
  expenseId?: string | null;
  actorUserId?: string | null;
};

/**
 * طبقة الكتابة للدفتر الأستاذ العام القديم (`GeneralLedgerEntry`).
 * مُبسَّطة متعمدًا: سطر واحد فقط — لا توازن، لا تحقق من رموز الحسابات.
 * مُستخدَمة من مسارات V4 (المصروفات، إدارة الكاش) التي تُحوَّل تدريجيًا
 * نحو `DoubleEntryJournalService` في V20+.
 *
 * Write layer for the legacy single-entry general ledger (`GeneralLedgerEntry`).
 * Deliberately thin: one row per call — no balance check, no account code validation.
 * Used by V4-era flows (expenses, cash management) being progressively migrated
 * to `DoubleEntryJournalService` in V20+.
 *
 * @since V4
 */
@Injectable()
export class GeneralLedgerService {
  /**
   * يُضيف سجلًا واحدًا في دفتر الأستاذ العام القديم داخل معاملة Prisma نشطة.
   * المبلغ يُحوَّل إلى `Prisma.Decimal` تلقائيًا إذا مُرِّر كرقم أو نص.
   *
   * Appends a single entry to the legacy general ledger within an active Prisma transaction.
   * Amount is automatically coerced to `Prisma.Decimal` if passed as number or string.
   *
   * @param tx - معاملة Prisma نشطة | Active Prisma transaction client
   * @param row - بيانات السجل | Entry data
   * @returns وعد بنتيجة الإنشاء من Prisma | Prisma create promise
   * @since V4
   */
  append(tx: Prisma.TransactionClient, row: AppendLedgerInput) {
    const dec =
      typeof row.amount === 'object' &&
      row.amount !== null &&
      'toFixed' in row.amount
        ? (row.amount as Prisma.Decimal)
        : new Prisma.Decimal(String(row.amount));
    return tx.generalLedgerEntry.create({
      data: {
        entryType: row.entryType,
        amount: dec,
        memo: row.memo ?? null,
        ...(row.metadata !== undefined ? { metadata: row.metadata } : {}),
        customerId: row.customerId ?? null,
        orderId: row.orderId ?? null,
        expenseId: row.expenseId ?? null,
        actorUserId: row.actorUserId ?? null,
      },
    });
  }
}

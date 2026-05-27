import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  createMyExpense,
  fetchMyCashReceipts,
  fetchMyDailySales,
  fetchMyDebtTransfers,
  fetchMyExpenses,
  signDebtTransfer,
  type DebtTransferRow,
  type DriverCashReceiptRow,
  type DriverExpenseRow,
  type IssuedInvoiceReportRow,
} from '@/api/orders';
import { useAuth } from '@/auth/auth-context';
import { DriverChrome } from '@/components/driver/driver-chrome';
import {
  GhostButton,
  PrimaryButton,
  SectionHeader,
  StatTile,
  StatusPill,
  SurfaceCard,
} from '@/components/ui';
import { formatKwdLabel } from '@/lib/kwd';
import { brand } from '@/theme/brand';

type Panel = 'sales' | 'receipts' | 'expenses' | 'transfers';

const PANEL_LABELS: Record<Panel, string> = {
  sales: 'مبيعاتي',
  receipts: 'السندات',
  expenses: 'مصروف',
  transfers: 'تحويلات',
};

function failureMessage(label: string, reason: unknown) {
  const detail = reason instanceof Error ? reason.message : 'تعذر التحميل';
  return `${label}: ${detail}`;
}

export default function DriverMoreScreen() {
  const { user, getValidAccessToken } = useAuth();
  const [panel, setPanel] = useState<Panel>('sales');
  const [sales, setSales] = useState<IssuedInvoiceReportRow[]>([]);
  const [salesTotal, setSalesTotal] = useState('0.000');
  const [receipts, setReceipts] = useState<DriverCashReceiptRow[]>([]);
  const [expenses, setExpenses] = useState<DriverExpenseRow[]>([]);
  const [transfers, setTransfers] = useState<DebtTransferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseNote, setExpenseNote] = useState('');
  const [savingExpense, setSavingExpense] = useState(false);
  const [signingId, setSigningId] = useState<string | null>(null);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      try {
        if (mode === 'initial') {
          setLoading(true);
        } else {
          setRefreshing(true);
        }
        const token = await getValidAccessToken();
        if (!token || !user?.id) {
          throw new Error('انتهت الجلسة');
        }
        const [salesReport, cashReceipts, expenseRows, transferRows] =
          await Promise.allSettled([
            fetchMyDailySales(token, user.id),
            fetchMyCashReceipts(token),
            fetchMyExpenses(token),
            fetchMyDebtTransfers(token),
          ]);
        const failures: string[] = [];

        if (salesReport.status === 'fulfilled') {
          setSales(salesReport.value.rows ?? []);
          setSalesTotal(salesReport.value.totals?.totalKd ?? '0.000');
        } else {
          setSales([]);
          setSalesTotal('0.000');
          failures.push(failureMessage('مبيعاتي', salesReport.reason));
        }

        if (cashReceipts.status === 'fulfilled') {
          setReceipts(cashReceipts.value);
        } else {
          setReceipts([]);
          failures.push(failureMessage('السندات', cashReceipts.reason));
        }

        if (expenseRows.status === 'fulfilled') {
          setExpenses(expenseRows.value);
        } else {
          setExpenses([]);
          failures.push(failureMessage('المصروفات', expenseRows.reason));
        }

        if (transferRows.status === 'fulfilled') {
          setTransfers(transferRows.value.rows ?? []);
        } else {
          setTransfers([]);
          failures.push(failureMessage('التحويلات', transferRows.reason));
        }

        setError(failures.length > 0 ? failures.join('\n') : null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'فشل التحميل');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [getValidAccessToken, user?.id],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const expenseTotal = useMemo(
    () => expenses.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
    [expenses],
  );

  async function saveExpense() {
    const amount = Number.parseFloat(expenseAmount.replace(',', '.'));
    if (!expenseTitle.trim() || !Number.isFinite(amount) || amount <= 0) {
      Alert.alert('بيانات ناقصة', 'أدخل وصف المصروف والمبلغ.');
      return;
    }
    setSavingExpense(true);
    try {
      const token = await getValidAccessToken();
      if (!token) {
        throw new Error('انتهت الجلسة');
      }
      await createMyExpense(token, {
        title: expenseTitle.trim(),
        amount,
        category: 'FUEL',
        expenseMethod: 'CASH',
        note: expenseNote.trim() || undefined,
      });
      setExpenseTitle('');
      setExpenseAmount('');
      setExpenseNote('');
      await load('refresh');
      Alert.alert('تم', 'تم إرسال المصروف للمحاسب للاعتماد.');
    } catch (err) {
      Alert.alert('فشل', err instanceof Error ? err.message : 'تعذر حفظ المصروف');
    } finally {
      setSavingExpense(false);
    }
  }

  async function signTransfer(row: DebtTransferRow) {
    if (!user?.id) {
      return;
    }
    const side =
      row.sourceDriver.id === user.id
        ? 'source'
        : row.targetDriver.id === user.id
          ? 'target'
          : null;
    if (!side) {
      return;
    }
    setSigningId(row.id);
    try {
      const token = await getValidAccessToken();
      if (!token) {
        throw new Error('انتهت الجلسة');
      }
      await signDebtTransfer(token, row.id, side);
      await load('refresh');
    } catch (err) {
      Alert.alert('فشل', err instanceof Error ? err.message : 'تعذر التوقيع');
    } finally {
      setSigningId(null);
    }
  }

  return (
    <DriverChrome title="المزيد">
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load('refresh')} />
        }
      >
        <SectionHeader
          eyebrow="Driver ERP"
          title="خدمات السائق"
          subtitle="مطابقة لقائمة السائق في نظام SAFARI ERP"
        />

        <View style={styles.tabs}>
          {(Object.keys(PANEL_LABELS) as Panel[]).map((key) => (
            <Pressable
              key={key}
              onPress={() => setPanel(key)}
              style={[styles.segment, panel === key && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, panel === key && styles.segmentTextActive]}>
                {PANEL_LABELS[key]}
              </Text>
            </Pressable>
          ))}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading ? (
          <ActivityIndicator color={brand.colors.primaryBlue} size="large" />
        ) : panel === 'sales' ? (
          <SalesPanel rows={sales} total={salesTotal} />
        ) : panel === 'receipts' ? (
          <ReceiptsPanel rows={receipts} />
        ) : panel === 'expenses' ? (
          <ExpensesPanel
            rows={expenses}
            total={expenseTotal.toFixed(3)}
            title={expenseTitle}
            amount={expenseAmount}
            note={expenseNote}
            saving={savingExpense}
            onTitle={setExpenseTitle}
            onAmount={setExpenseAmount}
            onNote={setExpenseNote}
            onSave={() => void saveExpense()}
          />
        ) : (
          <TransfersPanel
            rows={transfers}
            userId={user?.id ?? ''}
            signingId={signingId}
            onSign={(row) => void signTransfer(row)}
          />
        )}
      </ScrollView>
    </DriverChrome>
  );
}

function SalesPanel({
  rows,
  total,
}: {
  rows: IssuedInvoiceReportRow[];
  total: string;
}) {
  return (
    <>
      <StatTile label="مبيعات اليوم" value={formatKwdLabel(total)} sub={`${rows.length} فاتورة`} tone="primary" />
      {rows.length === 0 ? <Empty text="لا توجد مبيعات اليوم." /> : null}
      {rows.map((row) => (
        <SurfaceCard key={row.id}>
          <Text style={styles.cardTitle}>{row.customer.displayName ?? row.customer.phone}</Text>
          <Text style={styles.cardAmount}>{formatKwdLabel(row.totalPrice)}</Text>
          <Text style={styles.meta}>{row.serialNumber ?? row.invoiceNumber ?? row.id.slice(0, 8)}</Text>
          <StatusPill label={row.posPaymentMethod ?? row.status} tone="neutral" />
        </SurfaceCard>
      ))}
    </>
  );
}

function ReceiptsPanel({ rows }: { rows: DriverCashReceiptRow[] }) {
  const total = rows.reduce((sum, row) => sum + Number(row.amountKd), 0).toFixed(3);
  return (
    <>
      <StatTile label="سندات الاستلام" value={formatKwdLabel(total)} sub={`${rows.length} سند`} tone="completed" />
      {rows.length === 0 ? <Empty text="لا توجد سندات استلام بعد." /> : null}
      {rows.map((row) => (
        <SurfaceCard key={row.id}>
          <Text style={styles.cardTitle}>{row.managerName}</Text>
          <Text style={styles.cardAmount}>{formatKwdLabel(row.amountKd)}</Text>
          <Text style={styles.meta}>{row.branchName ?? '—'} · {row.settledOrderCount} فاتورة</Text>
          <StatusPill label={receiptStatusLabel(row.status)} tone={receiptTone(row.status)} />
        </SurfaceCard>
      ))}
    </>
  );
}

function ExpensesPanel({
  rows,
  total,
  title,
  amount,
  note,
  saving,
  onTitle,
  onAmount,
  onNote,
  onSave,
}: {
  rows: DriverExpenseRow[];
  total: string;
  title: string;
  amount: string;
  note: string;
  saving: boolean;
  onTitle: (value: string) => void;
  onAmount: (value: string) => void;
  onNote: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <>
      <SurfaceCard>
        <Text style={styles.cardTitle}>إضافة مصروف ميداني</Text>
        <Text style={styles.meta}>مطابق لـ my-field-expenses: السائق يسجل FUEL نقداً ويذهب للمحاسب للاعتماد.</Text>
        <TextInput value={title} onChangeText={onTitle} placeholder="وصف المصروف" placeholderTextColor={brand.colors.textMuted} textAlign="right" style={styles.input} />
        <TextInput value={amount} onChangeText={onAmount} placeholder="المبلغ" placeholderTextColor={brand.colors.textMuted} keyboardType="decimal-pad" textAlign="right" style={styles.input} />
        <TextInput value={note} onChangeText={onNote} placeholder="ملاحظة اختيارية" placeholderTextColor={brand.colors.textMuted} textAlign="right" style={styles.input} />
        <PrimaryButton label={saving ? 'جاري الحفظ…' : 'إرسال للمحاسبة'} onPress={onSave} disabled={saving} />
      </SurfaceCard>
      <StatTile label="مصروفات اليوم" value={formatKwdLabel(total)} sub={`${rows.length} عملية`} tone="warning" />
      {rows.map((row) => (
        <SurfaceCard key={row.id}>
          <Text style={styles.cardTitle}>{row.title}</Text>
          <Text style={styles.cardAmount}>{formatKwdLabel(row.amount)}</Text>
          <StatusPill label={expenseStatusLabel(row.status)} tone={expenseTone(row.status)} />
        </SurfaceCard>
      ))}
    </>
  );
}

function TransfersPanel({
  rows,
  userId,
  signingId,
  onSign,
}: {
  rows: DebtTransferRow[];
  userId: string;
  signingId: string | null;
  onSign: (row: DebtTransferRow) => void;
}) {
  return (
    <>
      <StatTile label="تحويلات المديونية" value={String(rows.length)} sub="توقيع السائق عند الحاجة" tone="neutral" />
      {rows.length === 0 ? <Empty text="لا توجد تحويلات مديونية تخصك." /> : null}
      {rows.map((row) => {
        const isSource = row.sourceDriver.id === userId;
        const needsSign = isSource ? !row.sourceSignedAt : !row.targetSignedAt;
        return (
          <SurfaceCard key={row.id}>
            <Text style={styles.cardTitle}>{row.sourceDriver.fullName} ← {row.targetDriver.fullName}</Text>
            <Text style={styles.cardAmount}>{formatKwdLabel(row.totalAmount)}</Text>
            <Text style={styles.meta}>{row.orderCount} فاتورة · {row.reason ?? 'بدون سبب'}</Text>
            <StatusPill label={transferStatusLabel(row.status)} tone={row.status === 'COMPLETED' ? 'completed' : row.status === 'CANCELLED' ? 'cancelled' : 'warning'} />
            {needsSign && row.status === 'AWAITING_SIGNATURES' ? (
              <GhostButton label={signingId === row.id ? 'جاري التوقيع…' : 'توقيع التحويل'} onPress={() => onSign(row)} disabled={signingId !== null} />
            ) : null}
          </SurfaceCard>
        );
      })}
    </>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <SurfaceCard>
      <Text style={styles.empty}>{text}</Text>
    </SurfaceCard>
  );
}

function receiptStatusLabel(status: DriverCashReceiptRow['status']) {
  return status === 'VERIFIED'
    ? 'مُدقّق'
    : status === 'REJECTED'
      ? 'مرفوض'
      : status === 'AWAITING_VERIFICATION'
        ? 'بانتظار التدقيق'
        : 'بانتظار الإيداع';
}

function receiptTone(status: DriverCashReceiptRow['status']) {
  return status === 'VERIFIED'
    ? 'completed'
    : status === 'REJECTED'
      ? 'cancelled'
      : 'pending';
}

function expenseStatusLabel(status: DriverExpenseRow['status']) {
  return status === 'APPROVED'
    ? 'معتمد'
    : status === 'REJECTED'
      ? 'مرفوض'
      : status === 'AUDIT'
        ? 'تدقيق'
        : 'بانتظار المحاسب';
}

function expenseTone(status: DriverExpenseRow['status']) {
  return status === 'APPROVED'
    ? 'completed'
    : status === 'REJECTED'
      ? 'cancelled'
      : 'warning';
}

function transferStatusLabel(status: DebtTransferRow['status']) {
  return status === 'COMPLETED'
    ? 'مكتمل'
    : status === 'CANCELLED'
      ? 'ملغى'
      : status === 'AWAITING_SIGNATURES'
        ? 'بانتظار التواقيع'
        : 'مسودة';
}

const styles = StyleSheet.create({
  scroll: { gap: 12, paddingBottom: 104 },
  tabs: {
    flexDirection: 'row-reverse',
    gap: 8,
    flexWrap: 'wrap',
  },
  segment: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: brand.colors.border,
    backgroundColor: brand.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  segmentActive: {
    backgroundColor: brand.colors.darkBlue,
    borderColor: brand.colors.darkBlue,
  },
  segmentText: {
    color: brand.colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  segmentTextActive: { color: brand.colors.white },
  cardTitle: {
    color: brand.colors.text,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'right',
  },
  cardAmount: {
    color: brand.colors.primaryBlue,
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'right',
  },
  meta: {
    color: brand.colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'right',
  },
  input: {
    backgroundColor: brand.colors.surfaceMuted,
    borderRadius: brand.radius.md,
    borderWidth: 1,
    borderColor: brand.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: brand.colors.text,
  },
  empty: {
    color: brand.colors.textMuted,
    textAlign: 'center',
  },
  error: {
    color: brand.colors.danger,
    textAlign: 'right',
  },
});

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
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
import {
  RECEIPT_COMPRESS_LEVELS,
  RECEIPT_RESIZE_WIDTH,
  receiptFitsPayloadLimit,
} from '@/lib/receipt-image';
import { brand } from '@/theme/brand';
import type { ExpenseMethod } from '@/api/orders';

type Panel = 'sales' | 'receipts' | 'expenses' | 'transfers';

const PANEL_LABELS: Record<Panel, string> = {
  sales: 'مبيعاتي',
  receipts: 'السندات',
  expenses: 'مصروف',
  transfers: 'تحويلات',
};

async function compressReceiptImage(uri: string): Promise<string> {
  let lastDataUrl: string | null = null;
  for (const compress of RECEIPT_COMPRESS_LEVELS) {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: RECEIPT_RESIZE_WIDTH } }],
      {
        compress,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      },
    );
    if (!result.base64) {
      continue;
    }
    const dataUrl = `data:image/jpeg;base64,${result.base64}`;
    lastDataUrl = dataUrl;
    if (receiptFitsPayloadLimit(dataUrl)) {
      return dataUrl;
    }
  }
  throw new Error(
    lastDataUrl
      ? 'الصورة كبيرة جداً. قرّب على الوصل فقط أو قص الأطراف ثم أعد المحاولة.'
      : 'تعذر ضغط صورة الوصل.',
  );
}

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
  const [expenseMethod, setExpenseMethod] = useState<ExpenseMethod>('PREPAID_CARD');
  const [expenseReceipt, setExpenseReceipt] = useState<string | null>(null);
  const [expenseReceiptBusy, setExpenseReceiptBusy] = useState(false);
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
    if (!expenseReceipt) {
      Alert.alert('صورة الوصل مطلوبة', 'أرفق صورة واضحة للوصل قبل إرسال المصروف.');
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
        expenseMethod,
        note: expenseNote.trim() || undefined,
        receiptUrl: expenseReceipt,
      });
      setExpenseTitle('');
      setExpenseAmount('');
      setExpenseNote('');
      setExpenseReceipt(null);
      await load('refresh');
      Alert.alert('تم', 'تم إرسال المصروف للمحاسب للاعتماد.');
    } catch (err) {
      Alert.alert('فشل', err instanceof Error ? err.message : 'تعذر حفظ المصروف');
    } finally {
      setSavingExpense(false);
    }
  }

  async function pickExpenseReceipt() {
    setExpenseReceiptBusy(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('الصلاحية مطلوبة', 'اسمح للتطبيق باستخدام الكاميرا لتصوير الوصل.');
        return;
      }
      const picked = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 1,
      });
      if (picked.canceled || !picked.assets[0]?.uri) {
        return;
      }
      const compressed = await compressReceiptImage(picked.assets[0].uri);
      setExpenseReceipt(compressed);
    } catch (err) {
      Alert.alert(
        'تعذر إرفاق الوصل',
        err instanceof Error ? err.message : 'حاول بصورة أوضح وأصغر.',
      );
    } finally {
      setExpenseReceiptBusy(false);
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
            method={expenseMethod}
            receipt={expenseReceipt}
            receiptBusy={expenseReceiptBusy}
            saving={savingExpense}
            onTitle={setExpenseTitle}
            onAmount={setExpenseAmount}
            onNote={setExpenseNote}
            onMethod={setExpenseMethod}
            onPickReceipt={() => void pickExpenseReceipt()}
            onClearReceipt={() => setExpenseReceipt(null)}
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
  method,
  receipt,
  receiptBusy,
  saving,
  onTitle,
  onAmount,
  onNote,
  onMethod,
  onPickReceipt,
  onClearReceipt,
  onSave,
}: {
  rows: DriverExpenseRow[];
  total: string;
  title: string;
  amount: string;
  note: string;
  method: ExpenseMethod;
  receipt: string | null;
  receiptBusy: boolean;
  saving: boolean;
  onTitle: (value: string) => void;
  onAmount: (value: string) => void;
  onNote: (value: string) => void;
  onMethod: (value: ExpenseMethod) => void;
  onPickReceipt: () => void;
  onClearReceipt: () => void;
  onSave: () => void;
}) {
  const [receiptOpen, setReceiptOpen] = useState(false);

  return (
    <>
      <SurfaceCard>
        <Text style={styles.cardTitle}>إضافة مصروف ميداني</Text>
        <Text style={styles.meta}>مطابق لـ my-field-expenses: السائق يسجل FUEL مع صورة وصل ويذهب للمحاسب للاعتماد.</Text>
        <TextInput value={title} onChangeText={onTitle} placeholder="وصف المصروف" placeholderTextColor={brand.colors.textMuted} textAlign="right" style={styles.input} />
        <TextInput value={amount} onChangeText={onAmount} placeholder="المبلغ" placeholderTextColor={brand.colors.textMuted} keyboardType="decimal-pad" textAlign="right" style={styles.input} />
        <View style={styles.methodRow}>
          <Pressable
            onPress={() => onMethod('PREPAID_CARD')}
            style={[styles.methodChip, method === 'PREPAID_CARD' && styles.methodChipActive]}
          >
            <Text
              style={[
                styles.methodChipText,
                method === 'PREPAID_CARD' && styles.methodChipTextActive,
              ]}
            >
              كرت الشركة
            </Text>
          </Pressable>
          <Pressable
            onPress={() => onMethod('CASH')}
            style={[styles.methodChip, method === 'CASH' && styles.methodChipActive]}
          >
            <Text
              style={[
                styles.methodChipText,
                method === 'CASH' && styles.methodChipTextActive,
              ]}
            >
              كاش من العهدة
            </Text>
          </Pressable>
        </View>
        <TextInput value={note} onChangeText={onNote} placeholder="ملاحظة اختيارية" placeholderTextColor={brand.colors.textMuted} textAlign="right" style={styles.input} />
        <View style={styles.receiptBox}>
          <View style={styles.receiptTextBlock}>
            <Text style={styles.receiptTitle}>صورة الوصل</Text>
            <Text style={styles.receiptHint}>
              التصوير مباشر فقط، ثم تُضغط الصورة تلقائياً كـ JPEG واضح.
            </Text>
          </View>
          {receipt ? (
            <Pressable onPress={() => setReceiptOpen(true)}>
              <Image source={{ uri: receipt }} style={styles.receiptPreview} />
              <Text style={styles.receiptOpenHint}>اضغط لعرض الوصل بحجم الشاشة</Text>
            </Pressable>
          ) : null}
          <View style={styles.receiptActions}>
            <GhostButton
              label={
                receiptBusy
                  ? 'جاري تجهيز الصورة…'
                  : receipt
                    ? 'إعادة تصوير الوصل'
                    : 'تصوير الوصل'
              }
              onPress={onPickReceipt}
              disabled={receiptBusy || saving}
            />
            {receipt ? (
              <Pressable onPress={onClearReceipt} disabled={saving}>
                <Text style={styles.receiptClear}>حذف الوصل</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
        <PrimaryButton label={saving ? 'جاري الحفظ…' : 'إرسال للمحاسبة'} onPress={onSave} disabled={saving || receiptBusy} />
      </SurfaceCard>
      <Modal
        visible={receiptOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setReceiptOpen(false)}
      >
        <View style={styles.receiptModalBackdrop}>
          <Pressable style={styles.receiptModalClose} onPress={() => setReceiptOpen(false)}>
            <Text style={styles.receiptModalCloseText}>إغلاق</Text>
          </Pressable>
          {receipt ? (
            <Image
              source={{ uri: receipt }}
              resizeMode="contain"
              style={styles.receiptFullImage}
            />
          ) : null}
        </View>
      </Modal>
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
  methodRow: {
    flexDirection: 'row-reverse',
    gap: 8,
  },
  methodChip: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: brand.colors.border,
    backgroundColor: brand.colors.surfaceMuted,
    paddingVertical: 10,
    alignItems: 'center',
  },
  methodChipActive: {
    backgroundColor: brand.colors.darkBlue,
    borderColor: brand.colors.darkBlue,
  },
  methodChipText: {
    color: brand.colors.textMuted,
    fontSize: 13,
    fontWeight: '900',
  },
  methodChipTextActive: {
    color: brand.colors.white,
  },
  receiptBox: {
    borderRadius: brand.radius.lg,
    borderWidth: 1,
    borderColor: brand.colors.border,
    backgroundColor: brand.colors.surfaceMuted,
    padding: 12,
    gap: 10,
  },
  receiptTextBlock: { gap: 3 },
  receiptTitle: {
    color: brand.colors.text,
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'right',
  },
  receiptHint: {
    color: brand.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'right',
  },
  receiptPreview: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: brand.radius.md,
    backgroundColor: brand.colors.surface,
  },
  receiptOpenHint: {
    color: brand.colors.primaryBlue,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 6,
  },
  receiptActions: {
    gap: 8,
  },
  receiptClear: {
    color: brand.colors.danger,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
    paddingVertical: 8,
  },
  receiptModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.96)',
    padding: 16,
    justifyContent: 'center',
  },
  receiptModalClose: {
    position: 'absolute',
    top: 48,
    left: 18,
    zIndex: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  receiptModalCloseText: {
    color: brand.colors.white,
    fontSize: 14,
    fontWeight: '900',
  },
  receiptFullImage: {
    width: '100%',
    aspectRatio: 16 / 9,
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

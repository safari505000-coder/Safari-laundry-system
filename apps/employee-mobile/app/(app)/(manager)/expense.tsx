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
  fetchExpenses,
  type DriverExpenseRow,
  type ExpenseCategory,
  type ExpenseMethod,
} from '@/api/orders';
import { useAuth } from '@/auth/auth-context';
import { ManagerChrome } from '@/components/manager/manager-chrome';
import {
  GhostButton,
  PrimaryButton,
  SectionHeader,
  StatTile,
  StatusPill,
  SurfaceCard,
} from '@/components/ui';
import { formatKwdLabel, sumKwdStrings } from '@/lib/kwd';
import {
  RECEIPT_COMPRESS_LEVELS,
  RECEIPT_RESIZE_WIDTH,
  receiptFitsPayloadLimit,
} from '@/lib/receipt-image';
import { brand } from '@/theme/brand';

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

export default function ManagerExpenseScreen() {
  const { user, getValidAccessToken } = useAuth();
  const [expenses, setExpenses] = useState<DriverExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory>('SOAP');
  const [expenseMethod, setExpenseMethod] = useState<ExpenseMethod>('CASH');
  const [expenseNote, setExpenseNote] = useState('');
  const [expenseReceipt, setExpenseReceipt] = useState<string | null>(null);
  const [expenseReceiptBusy, setExpenseReceiptBusy] = useState(false);
  const [savingExpense, setSavingExpense] = useState(false);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      try {
        if (mode === 'initial') {
          setLoading(true);
        } else {
          setRefreshing(true);
        }
        const token = await getValidAccessToken();
        if (!token) {
          throw new Error('انتهت الجلسة');
        }
        // Fetch branch-scoped expenses
        const rows = await fetchExpenses(token, user?.branchId ?? undefined);
        setExpenses(rows);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'فشل التحميل');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [getValidAccessToken, user?.branchId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const expenseTotal = useMemo(
    () => sumKwdStrings(expenses.map((row) => row.amount)),
    [expenses],
  );

  async function saveExpense() {
    const amount = Number.parseFloat(expenseAmount.replace(',', '.'));
    if (!expenseTitle.trim() || !Number.isFinite(amount) || amount <= 0) {
      Alert.alert('بيانات ناقصة', 'أدخل وصف المصروف والمبلغ.');
      return;
    }
    // Note: managers do not strictly require a receipt photo on create in the backend logic,
    // but the driver field expense does. We'll enforce receipt photo here as well to match drivers
    // and keep accounting audit trail clean.
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
        category: expenseCategory,
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

  return (
    <ManagerChrome title="مصروف">
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load('refresh')} />
        }
      >
        <SectionHeader
          eyebrow="Manager ERP"
          title="مصروفات الفرع"
          subtitle="تسجيل ومراجعة مصاريف الفرع المعلقة والمعتمدة"
        />

        <SurfaceCard>
          <Text style={styles.cardTitle}>إضافة مصروف جديد</Text>
          <Text style={styles.meta}>سجل مصروفات الفرع (مثل صابون أو نثريات أخرى) مع صورة الوصل للاعتماد.</Text>

          <TextInput
            value={expenseTitle}
            onChangeText={setExpenseTitle}
            placeholder="وصف المصروف"
            placeholderTextColor={brand.colors.textMuted}
            textAlign="right"
            style={styles.input}
          />

          <TextInput
            value={expenseAmount}
            onChangeText={setExpenseAmount}
            placeholder="المبلغ (د.ك)"
            placeholderTextColor={brand.colors.textMuted}
            keyboardType="decimal-pad"
            textAlign="right"
            style={styles.input}
          />

          <Text style={styles.sectionLabel}>نوع المصروف</Text>
          <View style={styles.methodRow}>
            <Pressable
              onPress={() => setExpenseCategory('MISC')}
              style={[styles.methodChip, expenseCategory === 'MISC' && styles.methodChipActive]}
            >
              <Text
                style={[
                  styles.methodChipText,
                  expenseCategory === 'MISC' && styles.methodChipTextActive,
                ]}
              >
                نثريات أخرى
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setExpenseCategory('SOAP')}
              style={[styles.methodChip, expenseCategory === 'SOAP' && styles.methodChipActive]}
            >
              <Text
                style={[
                  styles.methodChipText,
                  expenseCategory === 'SOAP' && styles.methodChipTextActive,
                ]}
              >
                صابون
              </Text>
            </Pressable>
          </View>



          <TextInput
            value={expenseNote}
            onChangeText={setExpenseNote}
            placeholder="ملاحظة اختيارية"
            placeholderTextColor={brand.colors.textMuted}
            textAlign="right"
            style={styles.input}
          />

          <View style={styles.receiptBox}>
            <View style={styles.receiptTextBlock}>
              <Text style={styles.receiptTitle}>صورة الوصل</Text>
              <Text style={styles.receiptHint}>
                التصوير مباشر فقط، ثم تُضغط الصورة تلقائياً كـ JPEG واضح.
              </Text>
            </View>
            {expenseReceipt ? (
              <ReceiptPreviewModal receipt={expenseReceipt} onClear={() => setExpenseReceipt(null)} />
            ) : null}
            <View style={styles.receiptActions}>
              <GhostButton
                label={
                  expenseReceiptBusy
                    ? 'جاري تجهيز الصورة…'
                    : expenseReceipt
                      ? 'إعادة تصوير الوصل'
                      : 'تصوير الوصل'
                }
                onPress={() => void pickExpenseReceipt()}
                disabled={expenseReceiptBusy || savingExpense}
              />
            </View>
          </View>

          <PrimaryButton
            label={savingExpense ? 'جاري الحفظ…' : 'إرسال للمحاسبة'}
            onPress={() => void saveExpense()}
            disabled={savingExpense || expenseReceiptBusy}
          />
        </SurfaceCard>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading ? (
          <ActivityIndicator color={brand.colors.primaryBlue} size="large" />
        ) : (
          <>
            <StatTile
              label="مصروفات اليوم للفرع"
              value={formatKwdLabel(expenseTotal)}
              sub={`${expenses.length} عملية`}
              tone="warning"
            />
            {expenses.length === 0 ? (
              <SurfaceCard>
                <Text style={styles.empty}>لا توجد مصروفات مسجلة اليوم.</Text>
              </SurfaceCard>
            ) : null}
            {expenses.map((row) => (
              <SurfaceCard key={row.id}>
                <Text style={styles.cardTitle}>{row.title}</Text>
                <Text style={styles.cardAmount}>{formatKwdLabel(row.amount)}</Text>
                <Text style={styles.meta}>
                  {categoryLabelAr(row.category)} · {methodLabelAr(row.expenseMethod)}
                </Text>
                {row.note ? <Text style={styles.meta}>ملاحظة: {row.note}</Text> : null}
                <StatusPill label={expenseStatusLabel(row.status)} tone={expenseTone(row.status)} />
              </SurfaceCard>
            ))}
          </>
        )}
      </ScrollView>
    </ManagerChrome>
  );
}

function ReceiptPreviewModal({ receipt, onClear }: { receipt: string; onClear: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable onPress={() => setOpen(true)}>
        <Image source={{ uri: receipt }} style={styles.receiptPreview} />
        <Text style={styles.receiptOpenHint}>اضغط لعرض الوصل بحجم الشاشة</Text>
      </Pressable>
      <Pressable onPress={onClear}>
        <Text style={styles.receiptClear}>حذف الوصل</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.receiptModalBackdrop}>
          <Pressable style={styles.receiptModalClose} onPress={() => setOpen(false)}>
            <Text style={styles.receiptModalCloseText}>إغلاق</Text>
          </Pressable>
          <Image source={{ uri: receipt }} resizeMode="contain" style={styles.receiptFullImage} />
        </View>
      </Modal>
    </>
  );
}

function categoryLabelAr(category: ExpenseCategory) {
  switch (category) {
    case 'SOAP':
      return 'صابون';
    case 'FUEL':
      return 'بنزين';
    case 'MISC':
      return 'نثريات أخرى';
    default:
      return category;
  }
}

function methodLabelAr(method: ExpenseMethod) {
  switch (method) {
    case 'CASH':
      return 'كاش من العهدة';
    case 'PREPAID_CARD':
      return 'كرت الشركة';
    default:
      return method;
  }
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

const styles = StyleSheet.create({
  scroll: { gap: 12, paddingBottom: 104 },
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
  sectionLabel: {
    color: brand.colors.text,
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'right',
    marginTop: 6,
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

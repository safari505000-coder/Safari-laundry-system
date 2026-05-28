import { useLocalSearchParams, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Linking from 'expo-linking';
import {
  getCustomerLedger,
  listSubscriptionPlans,
  activateSubscription,
  cancelSubscription,
  recordPartialDebtPayment,
  sendFullBalancePaymentLinkWhatsapp,
  sendOrderPaymentLinkWhatsapp,
} from '@/api/call-center';
import type {
  CustomerLedgerResponse,
  SubscriptionPlanDto,
  CustomerLedgerEvent,
} from '@/api/call-center';
import { useAuth } from '@/auth/auth-context';
import { CcChrome } from '@/components/call-center/cc-chrome';
import {
  MutedText,
  PrimaryButton,
  GhostButton,
  SectionHeader,
  StatTile,
  StatusPill,
  SurfaceCard,
  Title,
} from '@/components/ui';
import { formatKwdLabel } from '@/lib/kwd';
import { brand } from '@/theme/brand';

export default function CallCenterCustomerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const customerId = typeof id === 'string' ? id : '';
  const { getValidAccessToken } = useAuth();

  // Screen State
  const [ledger, setLedger] = useState<CustomerLedgerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Modal States
  const [activateVisible, setActivateVisible] = useState(false);
  const [cancelVisible, setCancelVisible] = useState(false);
  const [paymentVisible, setPaymentVisible] = useState(false);

  // Form States - Activation
  const [plans, setPlans] = useState<SubscriptionPlanDto[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [activateMethod, setActivateMethod] = useState<'CASH' | 'KNET' | 'PAYMENT_LINK' | 'ONLINE' | 'DEBT_ON_ACCOUNT'>('CASH');
  const [companySupport, setCompanySupport] = useState('');
  const [submittingActivate, setSubmittingActivate] = useState(false);

  // Form States - Cancellation
  const [cancelReason, setCancelReason] = useState('');
  const [submittingCancel, setSubmittingCancel] = useState(false);

  // Form States - Payment
  const [payAmount, setPayAmount] = useState('');
  const [payDiscount, setPayDiscount] = useState('');
  const [payMethod, setPayMethod] = useState<'CASH' | 'KNET' | 'PAYMENT_LINK' | 'ONLINE'>('CASH');
  const [payNote, setPayNote] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  const loadLedger = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const token = await getValidAccessToken();
      if (!token) throw new Error('انتهت الجلسة');
      const data = await getCustomerLedger(token, customerId);
      setLedger(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تحميل كشف الحساب');
    } finally {
      setLoading(false);
    }
  }, [customerId, getValidAccessToken]);

  useEffect(() => {
    void loadLedger();
  }, [loadLedger]);

  // Load plans when opening activate modal
  useEffect(() => {
    if (activateVisible) {
      void (async () => {
        setPlansLoading(true);
        try {
          const token = await getValidAccessToken();
          if (!token) throw new Error('انتهت الجلسة');
          const p = await listSubscriptionPlans(token);
          setPlans(p);
          if (p.length > 0) setSelectedPlanId(p[0].id);
        } catch (err) {
          Alert.alert('فشل تحميل الخطط', err instanceof Error ? err.message : 'تعذر تحميل خطط الاشتراك');
        } finally {
          setPlansLoading(false);
        }
      })();
    }
  }, [activateVisible, getValidAccessToken]);

  // Actions
  async function handleFullBalance() {
    if (!customerId) return;
    setBusy('full');
    try {
      const token = await getValidAccessToken();
      if (!token) throw new Error('انتهت الجلسة');
      const res = await sendFullBalancePaymentLinkWhatsapp(token, customerId);
      Alert.alert(
        res.serverPush ? 'تم الإرسال' : 'تم إنشاء الرابط',
        res.serverPush
          ? 'أُرسل رابط دفع الكامل عبر واتساب'
          : `الرابط: ${res.paymentUrl}`,
      );
    } catch (err) {
      Alert.alert('فشل', err instanceof Error ? err.message : 'تعذر إرسال الرابط');
    } finally {
      setBusy(null);
    }
  }

  async function handleOrderLink(orderId: string) {
    setBusy(orderId);
    try {
      const token = await getValidAccessToken();
      if (!token) throw new Error('انتهت الجلسة');
      const res = await sendOrderPaymentLinkWhatsapp(token, orderId);
      Alert.alert(
        res.serverPush ? 'تم الإرسال' : 'تم إنشاء الرابط',
        res.paymentUrl,
      );
    } catch (err) {
      Alert.alert('فشل', err instanceof Error ? err.message : 'تعذر إرسال الرابط');
    } finally {
      setBusy(null);
    }
  }

  async function handleActivateSubmit() {
    if (!selectedPlanId) {
      Alert.alert('خطأ', 'يرجى اختيار خطة اشتراك أولاً.');
      return;
    }
    setSubmittingActivate(true);
    try {
      const token = await getValidAccessToken();
      if (!token) throw new Error('انتهت الجلسة');
      await activateSubscription(token, {
        customerId,
        planId: selectedPlanId,
        paymentMethod: activateMethod,
        autoCloseInvoices: true,
        companySupportAmountKd: companySupport.trim() ? companySupport.trim() : undefined,
      });
      setActivateVisible(false);
      setSelectedPlanId('');
      setCompanySupport('');
      Alert.alert('تم التفعيل', 'تم تفعيل الاشتراك للعميل بنجاح.');
      void loadLedger();
    } catch (err) {
      Alert.alert('فشل التفعيل', err instanceof Error ? err.message : 'تعذر تفعيل الاشتراك');
    } finally {
      setSubmittingActivate(false);
    }
  }

  async function handleCancelSubmit() {
    setSubmittingCancel(true);
    try {
      const token = await getValidAccessToken();
      if (!token) throw new Error('انتهت الجلسة');
      await cancelSubscription(token, {
        customerId,
        reason: cancelReason.trim() ? cancelReason.trim() : undefined,
      });
      setCancelVisible(false);
      setCancelReason('');
      Alert.alert('تم الإلغاء', 'تم إلغاء الاشتراك الحالي وتحديث المحفظة.');
      void loadLedger();
    } catch (err) {
      Alert.alert('فشل الإلغاء', err instanceof Error ? err.message : 'تعذر إلغاء الاشتراك');
    } finally {
      setSubmittingCancel(false);
    }
  }

  async function handlePaymentSubmit() {
    const amount = Number.parseFloat(payAmount.replace(',', '.'));
    const discount = payDiscount.trim() ? Number.parseFloat(payDiscount.replace(',', '.')) : 0;

    if ((!payAmount.trim() && !payDiscount.trim()) || (amount <= 0 && discount <= 0)) {
      Alert.alert('بيانات غير صالحة', 'يرجى إدخال مبلغ دفع أو خصم أكبر من الصفر.');
      return;
    }

    setSubmittingPayment(true);
    try {
      const token = await getValidAccessToken();
      if (!token) throw new Error('انتهت الجلسة');
      await recordPartialDebtPayment(token, customerId, {
        amountKd: amount ? amount.toFixed(4) : '0.0000',
        discountKd: discount ? discount.toFixed(4) : '0.0000',
        paymentMethod: payMethod,
        note: payNote.trim() ? payNote.trim() : undefined,
      });
      setPaymentVisible(false);
      setPayAmount('');
      setPayDiscount('');
      setPayNote('');
      Alert.alert('تم التسجيل', 'تم تسجيل الدفعة/الخصم وتعديل المديونية بنجاح.');
      void loadLedger();
    } catch (err) {
      Alert.alert('فشل التسجيل', err instanceof Error ? err.message : 'تعذر تسجيل الدفعة');
    } finally {
      setSubmittingPayment(false);
    }
  }

  // Helper translations
  function getEventKindAr(kind: string): string {
    switch (kind) {
      case 'SUBSCRIPTION_ACTIVATION':
        return 'تفعيل اشتراك جديد';
      case 'SUBSCRIPTION_CANCELLATION':
        return 'إلغاء الاشتراك';
      case 'SUBSCRIPTION_ROLLOVER_CARRY':
        return 'ترحيل الرصيد المتبقي';
      case 'ORDER_PAID_IN_FULL':
        return 'سداد فاتورة كاملة';
      case 'ORDER_SETTLEMENT_SUBSCRIPTION':
        return 'تسوية من رصيد الاشتراك';
      case 'ORDER_INVOICE_PARTIAL_PAYMENT':
        return 'دفع جزئي للفاتورة';
      case 'ORDER_INVOICE_ON_ACCOUNT':
        return 'إصدار فاتورة على الحساب';
      case 'PARTIAL_DEBT_PAYMENT':
        return 'سداد جزء من المديونية';
      default:
        return kind;
    }
  }

  function getPaymentMethodAr(method: string | null): string {
    if (!method) return 'غير محدد';
    switch (method) {
      case 'CASH':
        return 'كاش';
      case 'KNET':
        return 'كي نت';
      case 'ONLINE':
        return 'أونلاين';
      case 'PAYMENT_LINK':
        return 'رابط دفع';
      case 'DEBT_ON_ACCOUNT':
        return 'على الحساب';
      default:
        return method;
    }
  }

  function getSubStatusAr(status: string): string {
    switch (status) {
      case 'ACTIVE':
        return 'نشط';
      case 'CUT_OFF':
        return 'موقوف';
      case 'CLOSED':
        return 'ملغي/مغلق';
      default:
        return status;
    }
  }

  function getSubStatusTone(status: string): 'completed' | 'warning' | 'cancelled' | 'neutral' {
    switch (status) {
      case 'ACTIVE':
        return 'completed';
      case 'CUT_OFF':
        return 'warning';
      case 'CLOSED':
        return 'cancelled';
      default:
        return 'neutral';
    }
  }

  return (
    <CcChrome title="ملف العميل 360">
      <ScrollView contentContainerStyle={styles.wrap}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>← رجوع</Text>
        </Pressable>

        {loading ? (
          <ActivityIndicator color={brand.colors.primaryBlue} size="large" />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : ledger ? (
          <>
            {/* Cutoff Suspended Banner */}
            {ledger.isCutOff && (
              <View style={styles.suspendedBanner}>
                <Text style={styles.suspendedBannerText}>
                  ⚠️ حساب العميل موقوف مؤقتاً بسبب المديونية أو انتهاء الاشتراك
                </Text>
              </View>
            )}

            {/* Customer Metadata Header */}
            <SectionHeader
              eyebrow="Customer 360 Profile"
              title={ledger.customer.displayName || 'عميل بدون اسم'}
              subtitle={ledger.customer.phone || undefined}
            />

            {/* Financial Stats Grid */}
            <View style={styles.statsRow}>
              <View style={styles.statCol}>
                <StatTile
                  label="رصيد المحفظة"
                  value={formatKwdLabel(ledger.customer.walletBalanceKd)}
                  tone={Number(ledger.customer.walletBalanceKd) > 0 ? 'completed' : 'neutral'}
                />
              </View>
              <View style={styles.statCol}>
                <StatTile
                  label="المديونية المستحقة"
                  value={formatKwdLabel(ledger.customer.remainingDebtKd)}
                  tone={Number(ledger.customer.remainingDebtKd) > 0 ? 'warning' : 'completed'}
                />
              </View>
            </View>

            {/* Active Subscription Panel */}
            <SurfaceCard>
              <Text style={styles.sectionTitle}>نظام الاشتراك الحالي</Text>
              {ledger.activeSubscription ? (
                <View style={styles.subInfo}>
                  <View style={styles.subHeader}>
                    <Text style={styles.subPlanName}>{ledger.activeSubscription.planNameSnapshot}</Text>
                    <StatusPill
                      label={getSubStatusAr(ledger.activeSubscription.status)}
                      tone={getSubStatusTone(ledger.activeSubscription.status)}
                    />
                  </View>
                  <Text style={styles.subDetail}>
                    صلاحية الاشتراك: {ledger.activeSubscription.planValidityDays} أيام
                  </Text>
                  <Text style={styles.subDetail}>
                    تاريخ الانتهاء: {new Date(ledger.activeSubscription.expiresAtIso).toLocaleDateString('ar-KW')}
                  </Text>
                  <Text style={styles.subDetail}>
                    قيمة التمويل: {formatKwdLabel(ledger.activeSubscription.planActualBalanceKd)} (سعر البيع: {formatKwdLabel(ledger.activeSubscription.planSalePriceKd)})
                  </Text>

                  <View style={styles.btnSpacing}>
                    <GhostButton
                      label="إلغاء الاشتراك الفعال"
                      onPress={() => setCancelVisible(true)}
                    />
                  </View>
                </View>
              ) : (
                <View style={styles.noSubContainer}>
                  <MutedText>لا يوجد اشتراك نشط حالياً للعميل.</MutedText>
                  <View style={styles.btnSpacing}>
                    <PrimaryButton
                      label="تفعيل اشتراك جديد"
                      onPress={() => setActivateVisible(true)}
                    />
                  </View>
                </View>
              )}
            </SurfaceCard>

            {/* Actions Panel */}
            <SurfaceCard>
              <Text style={styles.sectionTitle}>إجراءات سريعة</Text>
              <View style={styles.actionsGrid}>
                <PrimaryButton
                  label="تسديد مديونية / خصم"
                  onPress={() => setPaymentVisible(true)}
                />
                <View style={{ height: 4 }} />
                <GhostButton
                  label={busy === 'full' ? 'جاري الإرسال…' : 'إرسال رابط سداد الكل عبر واتساب'}
                  onPress={() => void handleFullBalance()}
                  disabled={busy !== null || Number(ledger.customer.remainingDebtKd) <= 0}
                />
              </View>
            </SurfaceCard>

            {/* Unpaid Invoices List */}
            {ledger.invoices.filter(i => i.openDebt).length > 0 && (
              <>
                <Text style={styles.groupTitle}>الفواتير المفتوحة للمتابعة ({ledger.invoices.filter(i => i.openDebt).length})</Text>
                {ledger.invoices.filter(i => i.openDebt).map((invoice) => (
                  <SurfaceCard key={invoice.id}>
                    <View style={styles.invoiceHeader}>
                      <Text style={styles.invoiceSerial}>{invoice.serial || 'فاتورة بدون رقم متسلسل'}</Text>
                      <Text style={styles.invoiceAmount}>{formatKwdLabel(invoice.totalKd)}</Text>
                    </View>
                    <View style={styles.invoiceMeta}>
                      <Text style={styles.metaText}>
                        تاريخ الإصدار: {new Date(invoice.createdAtIso).toLocaleDateString('ar-KW')}
                      </Text>
                      {invoice.issuedWhileCutOff && (
                        <Text style={styles.cutoffWarning}>⚠️ صدرت أثناء الوقف</Text>
                      )}
                    </View>
                    <PrimaryButton
                      label={busy === invoice.id ? '…' : 'إرسال رابط الفاتورة — واتساب'}
                      onPress={() => void handleOrderLink(invoice.id)}
                      disabled={busy !== null}
                    />
                  </SurfaceCard>
                ))}
              </>
            )}

            {/* Ledger Timeline */}
            <Text style={styles.groupTitle}>كشف الحساب وسجل العمليات التاريخية</Text>
            {ledger.events.length === 0 ? (
              <SurfaceCard>
                <MutedText>لا توجد عمليات مسجلة في كشف حساب العميل.</MutedText>
              </SurfaceCard>
            ) : (
              <View style={styles.timelineContainer}>
                {ledger.events.map((event, index) => (
                  <View key={event.id} style={styles.timelineRow}>
                    <View style={styles.timelineSidebar}>
                      <View style={styles.timelineDot} />
                      {index < ledger.events.length - 1 && <View style={styles.timelineLine} />}
                    </View>
                    <View style={styles.timelineContent}>
                      <View style={styles.timelineHeader}>
                        <Text style={styles.timelineTitle}>{getEventKindAr(event.kind)}</Text>
                        <Text style={[
                          styles.timelineAmount,
                          event.kind === 'ORDER_INVOICE_ON_ACCOUNT' || event.kind === 'SUBSCRIPTION_CANCELLATION'
                            ? styles.debitText
                            : styles.creditText
                        ]}>
                          {event.kind === 'ORDER_INVOICE_ON_ACCOUNT' || event.kind === 'SUBSCRIPTION_CANCELLATION' ? '-' : '+'}
                          {formatKwdLabel(event.amountKd)}
                        </Text>
                      </View>
                      <Text style={styles.timelineDate}>
                        {new Date(event.atIso).toLocaleString('ar-KW')} · بقلم: {event.performedByName || 'النظام'}
                      </Text>
                      <Text style={styles.timelineBalances}>
                        الرصيد بعد: {formatKwdLabel(event.balanceAfterKd)} · الدين بعد: {formatKwdLabel(event.debtAfterKd)}
                      </Text>
                      {event.paymentMethod && (
                        <Text style={styles.timelineMeta}>طريقة الدفع: {getPaymentMethodAr(event.paymentMethod)}</Text>
                      )}
                      {event.note ? (
                        <Text style={styles.timelineNote}>ملاحظة: {event.note}</Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        ) : null}
      </ScrollView>

      {/* Modal 1: Activate Subscription */}
      <Modal visible={activateVisible} transparent animationType="slide" onRequestClose={() => setActivateVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalHeader}>تفعيل اشتراك جديد</Text>
            <ScrollView contentContainerStyle={styles.modalBody}>
              {plansLoading ? (
                <ActivityIndicator color={brand.colors.primaryBlue} size="large" />
              ) : (
                <>
                  <Text style={styles.inputLabel}>اختر خطة الاشتراك:</Text>
                  {plans.map((p) => (
                    <Pressable
                      key={p.id}
                      onPress={() => setSelectedPlanId(p.id)}
                      style={[styles.planCard, selectedPlanId === p.id && styles.planCardActive]}
                    >
                      <Text style={[styles.planCardTitle, selectedPlanId === p.id && styles.whiteText]}>
                        {p.name}
                      </Text>
                      <Text style={[styles.planCardMeta, selectedPlanId === p.id && styles.whiteTextSoft]}>
                        تمويل الرصيد: {formatKwdLabel(p.actualBalance)} · سعر البيع: {formatKwdLabel(p.salePrice)}
                      </Text>
                    </Pressable>
                  ))}

                  <Text style={styles.inputLabel}>طريقة سداد قيمة الاشتراك:</Text>
                  <View style={styles.methodRow}>
                    {(['CASH', 'KNET', 'DEBT_ON_ACCOUNT'] as const).map((m) => (
                      <Pressable
                        key={m}
                        onPress={() => setActivateMethod(m)}
                        style={[styles.methodChip, activateMethod === m && styles.methodChipActive]}
                      >
                        <Text style={[styles.methodChipText, activateMethod === m && styles.methodChipTextActive]}>
                          {getPaymentMethodAr(m)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={styles.methodRow}>
                    {(['PAYMENT_LINK', 'ONLINE'] as const).map((m) => (
                      <Pressable
                        key={m}
                        onPress={() => setActivateMethod(m)}
                        style={[styles.methodChip, activateMethod === m && styles.methodChipActive]}
                      >
                        <Text style={[styles.methodChipText, activateMethod === m && styles.methodChipTextActive]}>
                          {getPaymentMethodAr(m)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={styles.inputLabel}>دعم الشركة التسويقي (اختياري - د.ك):</Text>
                  <TextInput
                    value={companySupport}
                    onChangeText={setCompanySupport}
                    placeholder="مثال: 5.0000"
                    placeholderTextColor={brand.colors.textMuted}
                    keyboardType="decimal-pad"
                    textAlign="right"
                    style={styles.input}
                  />
                </>
              )}
            </ScrollView>
            <View style={styles.modalFooter}>
              <PrimaryButton
                label={submittingActivate ? 'جاري التفعيل…' : 'تفعيل الآن'}
                onPress={() => void handleActivateSubmit()}
                disabled={submittingActivate || plansLoading}
              />
              <View style={{ height: 8 }} />
              <GhostButton
                label="إلغاء"
                onPress={() => setActivateVisible(false)}
                disabled={submittingActivate}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal 2: Cancel Subscription */}
      <Modal visible={cancelVisible} transparent animationType="slide" onRequestClose={() => setCancelVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalHeader}>إلغاء الاشتراك الفعال</Text>
            <View style={styles.modalBody}>
              <Text style={styles.warningText}>
                ⚠️ تنبيه: إلغاء الاشتراك سيؤدي إلى تسوية وحساب المستقطع من المحفظة وإلغاء صلاحية العميل في الحصول على رصيد إضافي.
              </Text>
              <Text style={styles.inputLabel}>سبب إلغاء الاشتراك (اختياري):</Text>
              <TextInput
                value={cancelReason}
                onChangeText={setCancelReason}
                placeholder="أدخل سبب إلغاء الاشتراك للتدقيق"
                placeholderTextColor={brand.colors.textMuted}
                textAlign="right"
                style={styles.input}
              />
            </View>
            <View style={styles.modalFooter}>
              <PrimaryButton
                label={submittingCancel ? 'جاري الإلغاء…' : 'تأكيد إلغاء الاشتراك'}
                onPress={() => void handleCancelSubmit()}
                disabled={submittingCancel}
              />
              <View style={{ height: 8 }} />
              <GhostButton
                label="رجوع"
                onPress={() => setCancelVisible(false)}
                disabled={submittingCancel}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal 3: Record Partial Debt Payment */}
      <Modal visible={paymentVisible} transparent animationType="slide" onRequestClose={() => setPaymentVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalHeader}>تسجيل سداد مديونية / خصم</Text>
            <ScrollView contentContainerStyle={styles.modalBody}>
              <Text style={styles.inputLabel}>المبلغ المستلم كاش أو كي نت (د.ك):</Text>
              <TextInput
                value={payAmount}
                onChangeText={setPayAmount}
                placeholder="0.0000"
                placeholderTextColor={brand.colors.textMuted}
                keyboardType="decimal-pad"
                textAlign="right"
                style={styles.input}
              />

              <Text style={styles.inputLabel}>خصم مالي ممنوح للتسوية (اختياري - د.ك):</Text>
              <TextInput
                value={payDiscount}
                onChangeText={setPayDiscount}
                placeholder="0.0000"
                placeholderTextColor={brand.colors.textMuted}
                keyboardType="decimal-pad"
                textAlign="right"
                style={styles.input}
              />

              <Text style={styles.inputLabel}>طريقة تحصيل المبلغ:</Text>
              <View style={styles.methodRow}>
                {(['CASH', 'KNET'] as const).map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => setPayMethod(m)}
                    style={[styles.methodChip, payMethod === m && styles.methodChipActive]}
                  >
                    <Text style={[styles.methodChipText, payMethod === m && styles.methodChipTextActive]}>
                      {getPaymentMethodAr(m)}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.methodRow}>
                {(['PAYMENT_LINK', 'ONLINE'] as const).map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => setPayMethod(m)}
                    style={[styles.methodChip, payMethod === m && styles.methodChipActive]}
                  >
                    <Text style={[styles.methodChipText, payMethod === m && styles.methodChipTextActive]}>
                      {getPaymentMethodAr(m)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.inputLabel}>ملاحظات التدقيق (اختياري):</Text>
              <TextInput
                value={payNote}
                onChangeText={setPayNote}
                placeholder="مثال: تم الاستلام مع السائق محمد"
                placeholderTextColor={brand.colors.textMuted}
                textAlign="right"
                style={styles.input}
              />
            </ScrollView>
            <View style={styles.modalFooter}>
              <PrimaryButton
                label={submittingPayment ? 'جاري التسجيل…' : 'تسجيل العملية'}
                onPress={() => void handlePaymentSubmit()}
                disabled={submittingPayment}
              />
              <View style={{ height: 8 }} />
              <GhostButton
                label="إلغاء"
                onPress={() => setPaymentVisible(false)}
                disabled={submittingPayment}
              />
            </View>
          </View>
        </View>
      </Modal>
    </CcChrome>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, paddingBottom: 32 },
  back: {
    color: brand.colors.primaryBlue,
    textAlign: 'right',
    fontWeight: '600',
    marginBottom: 4,
  },
  error: { color: brand.colors.danger, textAlign: 'right' },

  // suspended banner
  suspendedBanner: {
    backgroundColor: brand.colors.dangerSoft,
    borderColor: brand.colors.danger,
    borderWidth: 1,
    borderRadius: brand.radius.md,
    padding: 12,
  },
  suspendedBannerText: {
    color: brand.colors.danger,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
    lineHeight: 18,
  },

  // layout
  statsRow: {
    flexDirection: 'row-reverse',
    gap: 8,
  },
  statCol: {
    flex: 1,
  },
  sectionTitle: {
    color: brand.colors.text,
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'right',
    marginBottom: 6,
  },
  groupTitle: {
    color: brand.colors.text,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'right',
    marginTop: 18,
    marginBottom: 4,
  },

  // active sub card
  subInfo: {
    gap: 6,
  },
  subHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  subPlanName: {
    fontSize: 16,
    fontWeight: '900',
    color: brand.colors.primaryBlue,
  },
  subDetail: {
    fontSize: 13,
    color: brand.colors.text,
    textAlign: 'right',
  },
  btnSpacing: {
    marginTop: 8,
  },
  noSubContainer: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },

  // actions
  actionsGrid: {
    gap: 6,
  },

  // open invoices
  invoiceHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  invoiceSerial: {
    fontWeight: '900',
    color: brand.colors.text,
    fontSize: 14,
  },
  invoiceAmount: {
    fontSize: 15,
    fontWeight: '900',
    color: brand.colors.text,
  },
  invoiceMeta: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  metaText: {
    fontSize: 12,
    color: brand.colors.textMuted,
  },
  cutoffWarning: {
    fontSize: 12,
    color: brand.colors.danger,
    fontWeight: '700',
  },

  // timeline events
  timelineContainer: {
    backgroundColor: brand.colors.surface,
    borderRadius: brand.radius.lg,
    borderWidth: 1,
    borderColor: brand.colors.border,
    padding: brand.space.lg,
  },
  timelineRow: {
    flexDirection: 'row-reverse',
    minHeight: 80,
  },
  timelineSidebar: {
    width: 24,
    alignItems: 'center',
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: brand.colors.primaryBlue,
    zIndex: 1,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: brand.colors.border,
    marginVertical: 4,
  },
  timelineContent: {
    flex: 1,
    marginRight: 10,
    paddingBottom: 16,
  },
  timelineHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timelineTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: brand.colors.text,
  },
  timelineAmount: {
    fontSize: 14,
    fontWeight: '900',
  },
  creditText: {
    color: brand.colors.success,
  },
  debitText: {
    color: brand.colors.danger,
  },
  timelineDate: {
    fontSize: 11,
    color: brand.colors.textMuted,
    textAlign: 'right',
    marginTop: 2,
  },
  timelineBalances: {
    fontSize: 12,
    color: brand.colors.text,
    textAlign: 'right',
    marginTop: 2,
  },
  timelineMeta: {
    fontSize: 11,
    color: brand.colors.textMuted,
    textAlign: 'right',
  },
  timelineNote: {
    fontSize: 11,
    fontStyle: 'italic',
    color: brand.colors.textMuted,
    textAlign: 'right',
    marginTop: 4,
    backgroundColor: brand.colors.surfaceMuted,
    padding: 6,
    borderRadius: 4,
  },

  // modals general
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: brand.colors.surface,
    borderTopLeftRadius: brand.radius.xl,
    borderTopRightRadius: brand.radius.xl,
    padding: brand.space.lg,
    maxHeight: '85%',
  },
  modalHeader: {
    fontSize: 18,
    fontWeight: '900',
    color: brand.colors.text,
    textAlign: 'center',
    marginBottom: brand.space.md,
  },
  modalBody: {
    gap: 12,
    paddingBottom: 20,
  },
  modalFooter: {
    marginTop: 10,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: brand.colors.text,
    textAlign: 'right',
    marginTop: 6,
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

  // plans selectors
  planCard: {
    borderRadius: brand.radius.md,
    borderWidth: 1,
    borderColor: brand.colors.border,
    backgroundColor: brand.colors.surfaceMuted,
    padding: 12,
    gap: 4,
    marginBottom: 6,
  },
  planCardActive: {
    backgroundColor: brand.colors.primaryBlue,
    borderColor: brand.colors.primaryBlue,
  },
  planCardTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: brand.colors.text,
    textAlign: 'right',
  },
  planCardMeta: {
    fontSize: 12,
    color: brand.colors.textMuted,
    textAlign: 'right',
  },
  whiteText: {
    color: brand.colors.white,
  },
  whiteTextSoft: {
    color: brand.colors.lightCyan,
  },

  // method selectors
  methodRow: {
    flexDirection: 'row-reverse',
    gap: 6,
    marginBottom: 4,
  },
  methodChip: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: brand.colors.border,
    backgroundColor: brand.colors.surfaceMuted,
    paddingVertical: 8,
    alignItems: 'center',
  },
  methodChipActive: {
    backgroundColor: brand.colors.darkBlue,
    borderColor: brand.colors.darkBlue,
  },
  methodChipText: {
    color: brand.colors.textMuted,
    fontSize: 12,
    fontWeight: '900',
  },
  methodChipTextActive: {
    color: brand.colors.white,
  },

  // checkbox / switch
  checkboxRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    marginVertical: 10,
  },
  checkboxLabel: {
    fontSize: 13,
    color: brand.colors.text,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: brand.colors.borderStrong,
    backgroundColor: brand.colors.surface,
  },
  checkboxChecked: {
    backgroundColor: brand.colors.primaryBlue,
    borderColor: brand.colors.primaryBlue,
  },

  // cancel modal warnings
  warningText: {
    color: brand.colors.danger,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'right',
    backgroundColor: brand.colors.dangerSoft,
    padding: 10,
    borderRadius: brand.radius.sm,
    marginBottom: 6,
  },
});


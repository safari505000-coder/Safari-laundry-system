import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { fetchCatalog, fetchCustomerPortalMe, submitOrderRequest } from '@/api/public';
import {
  addSavedAddress,
  readCustomerAccessToken,
  readSavedAddress,
  readSavedAddresses,
  readSavedPhone,
  writeSavedPhone,
} from '@/auth/customer-session';
import { useOrderCart } from '@/cart/order-cart';
import { registerCustomerPushIfPossible } from '@/device/use-customer-push';
import {
  CinematicOrb,
  FadeIn,
  GlassPanel,
  LuxuryButton,
  LuxuryChip,
  LuxuryField,
  LuxuryScreen,
  LuxuryScroll,
} from '@/design/luxury-system';
import { useScreenLayout } from '@/hooks/use-screen-layout';
import { formatKwdLabel } from '@/lib/kwd';
import { luxury } from '@/design/luxury-tokens';
import { validateOrderGuard, normalizeKuwaitPhone } from '@/order/order-guards';

const FOOTER_HEIGHT = 88;
type ServiceMode = 'COURIER' | 'BRANCH';
type PickupDay = 'TODAY' | 'TOMORROW' | 'AFTER_TOMORROW';
type PaymentMethod = 'ON_DELIVERY' | 'PAYMENT_LINK' | 'SUBSCRIPTION_BALANCE';

const pickupDays: Array<{ value: PickupDay; label: string; note: string }> = [
  { value: 'TODAY', label: 'اليوم', note: 'أقرب موعد متاح' },
  { value: 'TOMORROW', label: 'غداً', note: 'اختيار هادئ' },
  { value: 'AFTER_TOMORROW', label: 'بعد غد', note: 'تخطيط مسبق' },
];

const pickupWindows = ['10 ص - 1 م', '1 م - 4 م', '4 م - 7 م', '7 م - 10 م'];
const carePreferences = ['كي ناعم', 'تغليف', 'عطر خفيف', 'بدون عطر'];
const paymentMethods: Array<{ value: PaymentMethod; label: string; note: string }> = [
  { value: 'ON_DELIVERY', label: 'عند الاستلام', note: 'الدفع عند تسليم الطلب' },
  { value: 'PAYMENT_LINK', label: 'رابط دفع', note: 'نرسل لك رابط دفع آمن' },
  { value: 'SUBSCRIPTION_BALANCE', label: 'رصيد الاشتراك', note: 'خصم من الرصيد إن توفر' },
];

export default function OrderRequestScreen() {
  const params = useLocalSearchParams<{ service?: string }>();
  const { lines, setQuantity, removeLine, clearCart, addService, totalItems, estimateTotalKd } =
    useOrderCart();
  const { scrollBottomPad, stickyFooterBottom, sideInset } =
    useScreenLayout();

  const [branches, setBranches] = useState<string[]>([]);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [savedAddresses, setSavedAddresses] = useState<string[]>([]);
  const [branch, setBranch] = useState<string | null>(null);
  const [serviceMode, setServiceMode] = useState<ServiceMode>('COURIER');
  const [serviceType, setServiceType] = useState<'NORMAL' | 'EXPRESS'>('NORMAL');
  const [pickupDay, setPickupDay] = useState<PickupDay>('TODAY');
  const [pickupWindow, setPickupWindow] = useState(pickupWindows[2]);
  const [selectedCarePreferences, setSelectedCarePreferences] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('ON_DELIVERY');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const estimatedTotal = estimateTotalKd(serviceType);
  const hasCartItems = lines.length > 0;

  useEffect(() => {
    void fetchCatalog()
      .then((c) => setBranches(c.brand?.branches ?? []))
      .catch(() => undefined);
    void readSavedPhone().then((saved) => {
      if (saved) {
        setPhone(saved);
      }
    });
    void readSavedAddress().then((saved) => {
      if (saved) {
        setAddress(saved);
      }
    });
    void readSavedAddresses().then(setSavedAddresses);
    void (async () => {
      const token = await readCustomerAccessToken();
      if (!token) {
        return;
      }
      try {
        const profile = await fetchCustomerPortalMe();
        setPhone(profile.customer.phone);
        setName(profile.customer.displayName ?? '');
        const serverAddresses = profile.customer.addresses.map((item) => item.address);
        if (serverAddresses.length > 0) {
          setSavedAddresses(serverAddresses);
          setAddress(serverAddresses[0]);
        } else if (profile.customer.address) {
          setSavedAddresses([profile.customer.address]);
          setAddress(profile.customer.address);
        }
      } catch {
        // Keep the order form usable with local fallback data if the session is stale.
      }
    })();
  }, []);

  useEffect(() => {
    const serviceName = params.service?.trim();
    if (!serviceName) {
      return;
    }
    void fetchCatalog().then((catalog) => {
      const match = catalog.services.find((s) => s.nameAr === serviceName);
      if (match) {
        addService(match);
      }
    });
  }, [params.service, addService]);

  function validateOrder(): string | null {
    return validateOrderGuard({
      phone,
      itemCount: lines.length,
      serviceMode,
      address,
      pickupWindow,
      branch: branch ?? undefined,
    });
  }

  function openConfirm() {
    const validationError = validateOrder();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setConfirmOpen(true);
  }

  async function handleSubmit() {
    const validationError = validateOrder();
    if (validationError) {
      setError(validationError);
      setConfirmOpen(false);
      return;
    }

    const normalizedPhone = normalizeKuwaitPhone(phone);

    const noteLines = [
      `طريقة الخدمة: ${serviceMode === 'COURIER' ? 'مندوب (استلام/توصيل)' : 'تسليم في الفرع'}`,
      serviceType === 'EXPRESS' ? 'إيقاع الخدمة: عناية سريعة' : 'إيقاع الخدمة: العناية المعتادة',
      serviceMode === 'COURIER' ? `موعد الاستلام: ${pickupDayLabel(pickupDay)} · ${pickupWindow}` : '',
      `طريقة الدفع: ${paymentMethodLabel(paymentMethod)}`,
      selectedCarePreferences.length > 0 ? `تفضيلات العناية: ${selectedCarePreferences.join('، ')}` : '',
      branch ? `الفرع: ${branch}` : '',
      notes.trim(),
    ].filter(Boolean);

    setSubmitting(true);
    try {
      const res = await submitOrderRequest({
        customerPhone: normalizedPhone,
        customerDisplayName: name.trim() || undefined,
        customerAddress:
          serviceMode === 'COURIER' ? address.trim() || undefined : branch ?? undefined,
        serviceType,
        notes: noteLines.join('\n'),
        requestedItems: lines.map((l) => ({
          label: l.label,
          quantity: l.quantity,
        })),
      });
      Alert.alert(
        'تم تأكيد طلبك',
        `${res.message}\nرقم المتابعة: ${res.requestReference}`,
        [{ text: 'متابعة الطلب', onPress: () => router.push('/(tabs)/track') }],
      );
      await writeSavedPhone(normalizedPhone);
      if (serviceMode === 'COURIER') {
        const nextAddresses = await addSavedAddress(address.trim());
        setSavedAddresses(nextAddresses);
      }
      void registerCustomerPushIfPossible(normalizedPhone);
      clearCart();
      setSelectedCarePreferences([]);
      setPaymentMethod('ON_DELIVERY');
      setConfirmOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تأكيد الطلب الآن.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <LuxuryScreen>
      <CinematicOrb size={240} style={styles.orbTop} />
      <CinematicOrb size={170} delay={420} style={styles.orbBottom} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
          <LuxuryScroll
            style={styles.flex}
            contentContainerStyle={[
              styles.wrap,
              {
                paddingBottom: hasCartItems
                  ? FOOTER_HEIGHT + scrollBottomPad
                  : scrollBottomPad,
              },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <FadeIn>
              <View style={[styles.hero, !hasCartItems && styles.heroCompact]}>
                <Text style={styles.brand}>ORDER CONCIERGE</Text>
                <Text style={styles.heroTitle}>
                  {hasCartItems ? 'رتّب طلبك بهدوء' : 'ابدأ باختيار الخدمات'}
                </Text>
                <Text style={styles.heroCopy}>
                  {hasCartItems
                    ? 'اختر طريقة الاستلام وأضف بياناتك، ثم نبدأ رحلة العناية من باب منزلك.'
                    : 'تصفّح الخدمات وأضف ما تحتاجه للسلة — بعدها تكمل بيانات الاستلام والدفع هنا.'}
                </Text>
              </View>
            </FadeIn>

            {!hasCartItems ? (
              <GlassPanel elevated style={styles.emptyCartPanel}>
                <View style={styles.emptyCartIcon}>
                  <Ionicons name="basket-outline" size={28} color={luxury.color.blue600} />
                </View>
                <Text style={styles.sectionTitle}>لم تختر أي خدمة بعد</Text>
                <Text style={styles.muted}>
                  من تبويب الخدمات أو الرئيسية — اضغط + بجانب أي خدمة لإضافتها للسلة.
                </Text>
                <View style={styles.emptySteps}>
                  <EmptyStep n={1} label="اختر الخدمات من القائمة" />
                  <EmptyStep n={2} label="عدّل الكميات هنا في السلة" />
                  <EmptyStep n={3} label="أكمل الاستلام والتأكيد" />
                </View>
                <View style={styles.emptyActions}>
                  <LuxuryButton
                    label="تصفح الخدمات"
                    icon="sparkles"
                    onPress={() => router.push('/(tabs)/services')}
                  />
                  <LuxuryButton
                    label="العودة للرئيسية"
                    variant="secondary"
                    onPress={() => router.push('/(tabs)')}
                  />
                </View>
              </GlassPanel>
            ) : (
              <>
              <GlassPanel elevated>
                <Text style={styles.sectionTitle}>اختياراتك للعناية</Text>
                {lines.map((line) => (
                  <View key={line.serviceId} style={styles.cartRow}>
                    <View style={styles.qtyControls}>
                      <Pressable
                        onPress={() => setQuantity(line.serviceId, line.quantity - 1)}
                        style={styles.qtyBtn}
                      >
                        <Ionicons name="remove" size={18} color={luxury.color.blue600} />
                      </Pressable>
                      <Text style={styles.qtyText}>{line.quantity}</Text>
                      <Pressable
                        onPress={() => setQuantity(line.serviceId, line.quantity + 1)}
                        style={styles.qtyBtn}
                      >
                        <Ionicons name="add" size={18} color={luxury.color.blue600} />
                      </Pressable>
                    </View>
                    <View style={styles.cartMeta}>
                      <Text style={styles.cartName} numberOfLines={2}>
                        {line.label}
                      </Text>
                      <Text style={styles.cartPrice}>
                        {serviceType === 'EXPRESS'
                          ? formatKwdLabel(line.priceExpressKd)
                          : formatKwdLabel(line.priceNormalKd)}{' '}
                        / قطعة
                      </Text>
                    </View>
                    <Pressable onPress={() => removeLine(line.serviceId)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={20} color={luxury.color.danger} />
                    </Pressable>
                  </View>
                ))}
                <Pressable onPress={() => router.push('/(tabs)/services')}>
                  <Text style={styles.addMore}>إضافة خدمة أخرى</Text>
                </Pressable>
                <View style={styles.totalRow}>
                  <Text style={styles.totalValue}>{estimatedTotal} د.ك</Text>
                  <Text style={styles.totalLabel}>إجمالي تقديري</Text>
                </View>
              </GlassPanel>

            <GlassPanel>
              <Text style={styles.sectionTitle}>طريقة الاستلام</Text>
              <View style={styles.chips}>
                <LuxuryChip label="استلام من الباب" active={serviceMode === 'COURIER'} onPress={() => setServiceMode('COURIER')} />
                <LuxuryChip label="تسليم في الفرع" active={serviceMode === 'BRANCH'} onPress={() => setServiceMode('BRANCH')} />
              </View>
              <Text style={styles.sectionTitle}>إيقاع الخدمة</Text>
              <View style={styles.chips}>
                <LuxuryChip label="العناية المعتادة" active={serviceType === 'NORMAL'} onPress={() => setServiceType('NORMAL')} />
                <LuxuryChip label="عناية سريعة" active={serviceType === 'EXPRESS'} onPress={() => setServiceType('EXPRESS')} />
              </View>
            </GlassPanel>

            {serviceMode === 'COURIER' ? (
              <GlassPanel>
                <Text style={styles.sectionTitle}>موعد الاستلام</Text>
                <View style={styles.chips}>
                  {pickupDays.map((day) => (
                    <LuxuryChip
                      key={day.value}
                      label={day.label}
                      active={pickupDay === day.value}
                      onPress={() => setPickupDay(day.value)}
                    />
                  ))}
                </View>
                <View style={styles.chips}>
                  {pickupWindows.map((window) => (
                    <LuxuryChip
                      key={window}
                      label={window}
                      active={pickupWindow === window}
                      onPress={() => setPickupWindow(window)}
                    />
                  ))}
                </View>
                <Text style={styles.muted}>
                  {pickupDays.find((day) => day.value === pickupDay)?.note}
                </Text>
              </GlassPanel>
            ) : null}

            {branches.length > 0 ? (
              <GlassPanel>
                <Text style={styles.sectionTitle}>اختر الفرع</Text>
                <View style={styles.chips}>
                  {branches.map((b) => (
                    <LuxuryChip
                      key={b}
                      label={b.replace('سفاري ', '')}
                      active={branch === b}
                      onPress={() => setBranch(branch === b ? null : b)}
                    />
                  ))}
                </View>
              </GlassPanel>
            ) : null}

            <GlassPanel>
              <Text style={styles.sectionTitle}>تفضيلات العناية</Text>
              <Text style={styles.muted}>اختيارات سريعة تساعد الفريق على تنفيذ طلبك كما تحب.</Text>
              <View style={styles.chips}>
                {carePreferences.map((preference) => (
                  <LuxuryChip
                    key={preference}
                    label={preference}
                    active={selectedCarePreferences.includes(preference)}
                    onPress={() => {
                      setSelectedCarePreferences((current) =>
                        current.includes(preference)
                          ? current.filter((item) => item !== preference)
                          : [...current, preference],
                      );
                    }}
                  />
                ))}
              </View>
            </GlassPanel>

            <GlassPanel>
              <Text style={styles.sectionTitle}>طريقة الدفع</Text>
              <View style={styles.chips}>
                {paymentMethods.map((method) => (
                  <LuxuryChip
                    key={method.value}
                    label={method.label}
                    active={paymentMethod === method.value}
                    onPress={() => setPaymentMethod(method.value)}
                  />
                ))}
              </View>
              <Text style={styles.muted}>
                {paymentMethods.find((method) => method.value === paymentMethod)?.note}
              </Text>
            </GlassPanel>

            <GlassPanel>
              <Text style={styles.sectionTitle}>بيانات الوصول</Text>
              <LuxuryField
                label="رقم الجوال"
                icon="call-outline"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="5xxxxxxx"
              />
              <LuxuryField
                label="الاسم الكريم"
                icon="person-outline"
                value={name}
                onChangeText={setName}
                placeholder="مثال: عبدالله"
              />

              {serviceMode === 'COURIER' ? (
                <>
                  {savedAddresses.length > 0 ? (
                    <View style={styles.savedAddressesWrap}>
                      <Text style={styles.savedAddressLabel}>عناوين محفوظة</Text>
                      {savedAddresses.map((saved) => (
                        <Pressable
                          key={saved}
                          style={[
                            styles.savedAddress,
                            address === saved && styles.savedAddressActive,
                          ]}
                          onPress={() => setAddress(saved)}
                        >
                          <Text style={styles.savedAddressText} numberOfLines={2}>
                            {saved}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  <LuxuryField
                    label="عنوان الاستلام"
                    icon="location-outline"
                    value={address}
                    onChangeText={setAddress}
                    placeholder="المنطقة · القطعة · الشارع · المنزل"
                  />
                </>
              ) : null}

              <LuxuryField
                label="تفضيلات إضافية"
                icon="create-outline"
                value={notes}
                onChangeText={setNotes}
                style={styles.notesInput}
                multiline
                placeholder="وقت مفضل · تعليمات خاصة · تفاصيل القطع"
              />
            </GlassPanel>

            {error ? <Text style={styles.error}>{error}</Text> : null}
              </>
            )}
          </LuxuryScroll>

        <Modal
          visible={confirmOpen}
          animationType="slide"
          transparent
          onRequestClose={() => setConfirmOpen(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalSheet, { paddingBottom: scrollBottomPad }]}>
              <GlassPanel elevated>
                <Text style={styles.sectionTitle}>تأكيد الطلب</Text>
                <Text style={styles.muted}>
                  راجع التفاصيل قبل الإرسال — سيتواصل معك فريق سفاري لتأكيد الأصناف والوقت.
                </Text>
                <ReviewLine label="الخدمات" value={`${totalItems} قطعة`} />
                <ReviewLine label="الإجمالي التقديري" value={`${estimatedTotal} د.ك`} />
                <ReviewLine label="الجوال" value={normalizeKuwaitPhone(phone)} />
                <ReviewLine label="طريقة الدفع" value={paymentMethodLabel(paymentMethod)} />
                <ReviewLine
                  label="طريقة الاستلام"
                  value={serviceMode === 'COURIER' ? 'استلام من الباب' : 'تسليم في الفرع'}
                />
                <ReviewLine
                  label="الموعد"
                  value={
                    serviceMode === 'COURIER'
                      ? `${pickupDayLabel(pickupDay)} · ${pickupWindow}`
                      : branch ?? '—'
                  }
                />
                <ReviewLine
                  label={serviceMode === 'COURIER' ? 'العنوان' : 'الفرع'}
                  value={
                    serviceMode === 'COURIER'
                      ? address.trim()
                      : branch ?? '—'
                  }
                />
                {selectedCarePreferences.length > 0 ? (
                  <ReviewLine
                    label="تفضيلات العناية"
                    value={selectedCarePreferences.join('، ')}
                  />
                ) : null}
                <View style={styles.reviewActions}>
                  <LuxuryButton
                    label="رجوع للتعديل"
                    variant="secondary"
                    onPress={() => setConfirmOpen(false)}
                    disabled={submitting}
                  />
                  <LuxuryButton
                    label={submitting ? 'نؤكد طلبك…' : 'إرسال الطلب الآن'}
                    onPress={() => void handleSubmit()}
                    disabled={submitting}
                  />
                </View>
              </GlassPanel>
            </View>
          </View>
        </Modal>

        {hasCartItems ? (
        <View
          style={[
            styles.footer,
            { bottom: stickyFooterBottom, paddingHorizontal: sideInset },
          ]}
        >
          <LuxuryButton
            label={
              submitting
                ? 'نؤكد طلبك…'
                : `تأكيد الطلب · ${estimatedTotal} د.ك`
            }
            onPress={openConfirm}
            disabled={submitting}
          />
        </View>
        ) : null}
      </KeyboardAvoidingView>
    </LuxuryScreen>
  );
}

function paymentMethodLabel(method: PaymentMethod): string {
  switch (method) {
    case 'PAYMENT_LINK':
      return 'رابط دفع';
    case 'SUBSCRIPTION_BALANCE':
      return 'رصيد الاشتراك';
    case 'ON_DELIVERY':
    default:
      return 'عند الاستلام';
  }
}

function pickupDayLabel(day: PickupDay): string {
  switch (day) {
    case 'TODAY':
      return 'اليوم';
    case 'TOMORROW':
      return 'غداً';
    case 'AFTER_TOMORROW':
      return 'بعد غد';
    default:
      return 'اليوم';
  }
}

function ReviewLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reviewLine}>
      <Text style={styles.reviewValue} numberOfLines={2}>{value}</Text>
      <Text style={styles.reviewLabel}>{label}</Text>
    </View>
  );
}

function EmptyStep({ n, label }: { n: number; label: string }) {
  return (
    <View style={styles.emptyStep}>
      <View style={styles.emptyStepBadge}>
        <Text style={styles.emptyStepBadgeText}>{n}</Text>
      </View>
      <Text style={styles.emptyStepLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  orbTop: { top: -70, right: -80 },
  orbBottom: { bottom: 110, left: -70 },
  wrap: { gap: luxury.space.lg },
  hero: {
    minHeight: 190,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    gap: luxury.space.sm,
  },
  heroCompact: {
    minHeight: 132,
  },
  brand: {
    color: luxury.color.champagne,
    fontSize: luxury.type.caption,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  heroTitle: {
    color: luxury.color.graphite,
    fontSize: 40,
    lineHeight: 46,
    fontWeight: '900',
    textAlign: 'right',
    letterSpacing: -1,
  },
  heroCopy: {
    color: luxury.color.slate,
    fontSize: luxury.type.body,
    lineHeight: luxury.lineHeight.body,
    textAlign: 'right',
  },
  sectionTitle: {
    color: luxury.color.graphite,
    fontSize: luxury.type.headline,
    fontWeight: '900',
    textAlign: 'right',
  },
  muted: {
    color: luxury.color.slate,
    fontSize: luxury.type.body,
    lineHeight: luxury.lineHeight.body,
    textAlign: 'right',
  },
  emptyCartPanel: {
    gap: luxury.space.md,
    alignItems: 'flex-end',
  },
  emptyCartIcon: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: luxury.color.ice100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: luxury.space.xs,
  },
  emptySteps: {
    width: '100%',
    gap: luxury.space.sm,
    marginTop: luxury.space.xs,
  },
  emptyStep: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: luxury.space.sm,
  },
  emptyStepBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: luxury.color.navy900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStepBadgeText: {
    color: luxury.color.warmWhite,
    fontSize: 12,
    fontWeight: '900',
  },
  emptyStepLabel: {
    flex: 1,
    color: luxury.color.graphite,
    fontSize: luxury.type.callout,
    fontWeight: '700',
    textAlign: 'right',
  },
  emptyActions: {
    width: '100%',
    gap: luxury.space.sm,
    marginTop: luxury.space.sm,
  },
  cartRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: luxury.color.line,
  },
  cartMeta: { flex: 1, alignItems: 'flex-end', minWidth: 0, gap: 2 },
  cartName: { fontWeight: '800', color: luxury.color.graphite, textAlign: 'right' },
  cartPrice: { fontSize: 12, color: luxury.color.blue600, fontWeight: '700' },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: luxury.color.ice100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: { fontWeight: '800', minWidth: 20, textAlign: 'center' },
  addMore: {
    textAlign: 'right',
    color: luxury.color.blue600,
    fontWeight: '700',
    marginTop: 4,
  },
  totalRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: luxury.color.line,
    paddingTop: luxury.space.md,
    marginTop: luxury.space.xs,
  },
  totalLabel: {
    color: luxury.color.slate,
    fontSize: luxury.type.caption,
    fontWeight: '800',
  },
  totalValue: {
    color: luxury.color.graphite,
    fontSize: luxury.type.headline,
    fontWeight: '900',
  },
  notesInput: { minHeight: 96, textAlignVertical: 'top' },
  chips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  savedAddressesWrap: {
    alignItems: 'flex-end',
    gap: luxury.space.xs,
  },
  savedAddress: {
    alignItems: 'flex-end',
    backgroundColor: 'rgba(15,17,21,0.045)',
    borderRadius: luxury.radius.md,
    padding: luxury.space.md,
    width: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  savedAddressActive: {
    borderColor: luxury.color.blue600,
    backgroundColor: luxury.color.ice100,
  },
  savedAddressLabel: {
    color: luxury.color.blue600,
    fontSize: luxury.type.caption,
    fontWeight: '900',
  },
  savedAddressText: {
    color: luxury.color.graphite,
    fontSize: luxury.type.callout,
    lineHeight: luxury.lineHeight.callout,
    textAlign: 'right',
  },
  reviewLine: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    gap: luxury.space.md,
    paddingVertical: luxury.space.xs,
  },
  reviewLabel: {
    color: luxury.color.slate,
    fontSize: luxury.type.caption,
    fontWeight: '800',
  },
  reviewValue: {
    flex: 1,
    color: luxury.color.graphite,
    fontSize: luxury.type.callout,
    fontWeight: '800',
    textAlign: 'right',
  },
  reviewActions: {
    gap: luxury.space.sm,
    marginTop: luxury.space.sm,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15,17,21,0.45)',
  },
  modalSheet: {
    paddingHorizontal: luxury.space.lg,
    paddingTop: luxury.space.md,
  },
  error: { color: luxury.color.danger, textAlign: 'right', marginTop: 4 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: 'rgba(251,250,247,0.96)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: luxury.color.line,
    shadowColor: luxury.color.navy950,
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 16,
  },
});

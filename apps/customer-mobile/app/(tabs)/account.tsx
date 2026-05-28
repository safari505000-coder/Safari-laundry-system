import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import {
  createBalancePaymentLink,
  createInvoicePaymentLink,
  fetchCustomerPortalMe,
  fetchCustomerPortalPreview,
  requestCustomerOtp,
  updateCustomerProfile,
  devLoginCustomer,
  verifyCustomerOtp,
  type CustomerPortalMeResponse,
  type CustomerPortalOrder,
} from '@/api/public';
import {
  clearCustomerSession,
  clearFavoriteServiceIds,
  clearRatedOrderIds,
  clearSavedAddresses,
  readCustomerAccessToken,
  readSavedPhone,
  writeCustomerAccessToken,
  writeSavedPhone,
} from '@/auth/customer-session';
import { registerCustomerPushIfPossible } from '@/device/use-customer-push';
import {
  CinematicOrb,
  FadeIn,
  GlassPanel,
  LuxuryButton,
  LuxuryField,
  LuxuryScreen,
  LuxuryScroll,
} from '@/design/luxury-system';
import { useScreenLayout } from '@/hooks/use-screen-layout';
import { formatKwdLabel } from '@/lib/kwd';
import { deliveryStatusLabelAr } from '@/lib/delivery-status';
import { openOrderDeliveryTrack } from '@/lib/routes';
import { luxury } from '@/design/luxury-tokens';
import { brand } from '@/theme/brand';

const allowPhonePreview =
  Constants.expoConfig?.extra?.allowPhonePreview === true || __DEV__;
const allowDevLogin =
  Constants.expoConfig?.extra?.allowDevLogin === true || __DEV__;

type EditableAddress = {
  id?: string;
  label?: string;
  address: string;
  isDefault?: boolean;
};

export default function AccountScreen() {
  const { scrollBottomPad } = useScreenLayout();
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [portal, setPortal] = useState<CustomerPortalMeResponse | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [otpNotice, setOtpNotice] = useState<string | null>(null);
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState('');
  const [profileAddresses, setProfileAddresses] = useState<EditableAddress[]>([]);
  const [profileSaving, setProfileSaving] = useState(false);

  const loadPortalSession = useCallback(async (mode?: 'refresh') => {
    if (mode === 'refresh') {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const data = await fetchCustomerPortalMe();
      setPortal(data);
      resetProfileDraft(data);
      setSessionActive(true);
      await writeSavedPhone(data.customer.phone);
      void registerCustomerPushIfPossible(data.customer.phone);
    } catch (err) {
      setPortal(null);
      setSessionActive(false);
      await clearCustomerSession();
      setError(err instanceof Error ? err.message : 'انتهت الجلسة. سجّل دخولك مرة أخرى.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  function resetProfileDraft(data: CustomerPortalMeResponse) {
    setProfileName(data.customer.displayName ?? '');
    const serverAddresses = data.customer.addresses.map((item) => ({
      id: item.id,
      label: item.label ?? undefined,
      address: item.address,
      isDefault: item.isDefault,
    }));
    const legacyAddress =
      serverAddresses.length === 0 && data.customer.address
        ? [{ address: data.customer.address, isDefault: true }]
        : [];
    setProfileAddresses(serverAddresses.length > 0 ? serverAddresses : legacyAddress);
  }

  useEffect(() => {
    void (async () => {
      const token = await readCustomerAccessToken();
      const saved = await readSavedPhone();
      if (saved) {
        setPhone(saved);
      }
      if (token) {
        await loadPortalSession();
      }
    })();
  }, [loadPortalSession]);

  async function sendOtp() {
    const normalized = phone.replace(/[\s-]/g, '').trim();
    if (normalized.length < 8) {
      setError('أدخل رقم جوال صحيح لاستلام رمز الدخول.');
      return;
    }
    setOtpLoading(true);
    setError(null);
    setOtpNotice(null);
    setDevOtpHint(null);
    try {
      const res = await requestCustomerOtp(normalized);
      setOtpNotice(res.message);
      setDevOtpHint(res.devOtpCode ?? null);
      await writeSavedPhone(normalized);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إرسال رمز الدخول الآن.');
    } finally {
      setOtpLoading(false);
    }
  }

  async function loginWithoutOtp() {
    const normalized = phone.replace(/[\s-]/g, '').trim();
    if (normalized.length < 8) {
      setError('أدخل رقم جوال صحيح.');
      return;
    }
    setVerifyLoading(true);
    setError(null);
    try {
      const res = await devLoginCustomer(normalized);
      await writeCustomerAccessToken(res.accessToken);
      await writeSavedPhone(res.customer.phone);
      setPhone(res.customer.phone);
      setOtpCode('');
      setDevOtpHint(null);
      await loadPortalSession();
      void registerCustomerPushIfPossible(res.customer.phone);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل الدخول.');
    } finally {
      setVerifyLoading(false);
    }
  }

  async function confirmOtp() {
    const normalized = phone.replace(/[\s-]/g, '').trim();
    const code = otpCode.replace(/\s/g, '').trim();
    if (code.length !== 6) {
      setError('أدخل رمز الدخول المكوّن من 6 أرقام.');
      return;
    }
    setVerifyLoading(true);
    setError(null);
    try {
      const res = await verifyCustomerOtp(normalized, code);
      await writeCustomerAccessToken(res.accessToken);
      await writeSavedPhone(res.customer.phone);
      setPhone(res.customer.phone);
      setOtpCode('');
      setDevOtpHint(null);
      await loadPortalSession();
      void registerCustomerPushIfPossible(res.customer.phone);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'رمز الدخول غير صحيح.');
    } finally {
      setVerifyLoading(false);
    }
  }

  async function loadPreview() {
    const normalized = phone.replace(/[\s-]/g, '').trim();
    if (normalized.length < 8) {
      setError('أدخل رقم جوال صحيح لعرض حسابك.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCustomerPortalPreview(normalized);
      setPortal(data);
      resetProfileDraft(data);
      setSessionActive(false);
      await writeSavedPhone(normalized);
    } catch (err) {
      setPortal(null);
      setError(err instanceof Error ? err.message : 'لم نجد حساباً مرتبطاً بهذا الرقم.');
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await clearCustomerSession();
    setPortal(null);
    setSessionActive(false);
    setOtpCode('');
    setOtpNotice(null);
    setDevOtpHint(null);
  }

  function updateProfileAddress(index: number, address: string) {
    setProfileAddresses((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, address } : item,
      ),
    );
  }

  function removeProfileAddress(index: number) {
    setProfileAddresses((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );
  }

  function addProfileAddress() {
    setProfileAddresses((current) => [
      ...current,
      {
        id: `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        address: '',
        isDefault: current.length === 0
      },
    ]);
  }

  async function saveProfile() {
    if (!sessionActive || !portal) {
      Alert.alert('تسجيل الدخول مطلوب', 'تعديل ملف العميل يتطلب دخولاً آمناً عبر واتساب.');
      return;
    }
    const cleanAddresses = profileAddresses
      .map((item, index) => ({
        id: item.id?.startsWith('temp-') ? undefined : item.id,
        label: item.label,
        address: item.address.trim(),
        isDefault: index === 0,
      }))
      .filter((item) => item.address.length > 0);
    setProfileSaving(true);
    setError(null);
    try {
      const updated = await updateCustomerProfile({
        displayName: profileName.trim(),
        addresses: cleanAddresses,
      });
      setPortal(updated);
      resetProfileDraft(updated);
      await writeSavedPhone(updated.customer.phone);
      Alert.alert('تم الحفظ', 'تم تحديث ملفك وعناوينك في النظام.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ ملف العميل الآن.');
    } finally {
      setProfileSaving(false);
    }
  }

  async function clearLocalData(kind: 'addresses' | 'favorites' | 'ratings') {
    if (kind === 'addresses') {
      await clearSavedAddresses();
      Alert.alert('تم المسح', 'تم حذف العناوين المحفوظة من هذا الجهاز.');
      return;
    }
    if (kind === 'favorites') {
      await clearFavoriteServiceIds();
      Alert.alert('تم المسح', 'تم حذف مفضلة الخدمات من هذا الجهاز.');
      return;
    }
    await clearRatedOrderIds();
    Alert.alert('تم المسح', 'تم حذف تقييمات التجربة المحفوظة محلياً.');
  }

  async function payBalance() {
    if (!portal || !sessionActive) {
      Alert.alert('تسجيل الدخول مطلوب', 'الدفع يتطلب دخولاً آمناً عبر رمز واتساب.');
      return;
    }
    setBusyOrderId('__balance__');
    try {
      const res = await createBalancePaymentLink(portal.customer.phone);
      if (res.paymentUrl) {
        await Linking.openURL(res.paymentUrl);
      } else {
        Alert.alert('الدفع غير متاح حالياً', res.message);
      }
    } catch (err) {
      Alert.alert('تعذر تجهيز رابط الدفع', err instanceof Error ? err.message : 'حاول مرة أخرى بعد قليل.');
    } finally {
      setBusyOrderId(null);
    }
  }

  async function payOrder(order: CustomerPortalOrder) {
    if (!portal || !sessionActive) {
      Alert.alert('تسجيل الدخول مطلوب', 'الدفع يتطلب دخولاً آمناً عبر رمز واتساب.');
      return;
    }
    setBusyOrderId(order.id);
    try {
      const res = await createInvoicePaymentLink({
        customerPhone: portal.customer.phone,
        orderId: order.id,
      });
      if (res.paymentUrl) {
        await Linking.openURL(res.paymentUrl);
      } else {
        Alert.alert('الدفع غير متاح حالياً', res.message);
      }
    } catch (err) {
      Alert.alert('تعذر تجهيز رابط الدفع', err instanceof Error ? err.message : 'حاول مرة أخرى بعد قليل.');
    } finally {
      setBusyOrderId(null);
    }
  }

  return (
    <LuxuryScreen>
      <CinematicOrb size={240} style={styles.orbTop} />
      <CinematicOrb size={170} delay={420} style={styles.orbBottom} />
      <LuxuryScroll
        contentContainerStyle={[styles.wrap, { paddingBottom: scrollBottomPad }]}
        refreshControl={
          portal ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() =>
                void (sessionActive ? loadPortalSession('refresh') : loadPreview())
              }
            />
          ) : undefined
        }
      >
        <FadeIn>
          <View style={styles.hero}>
            <Text style={styles.brand}>PRIVATE ACCOUNT</Text>
            <Text style={styles.heroTitle}>حسابك بهدوء ووضوح</Text>
            <Text style={styles.heroCopy}>
              فواتيرك، رصيدك، والدفع الآمن في مساحة واحدة واضحة وهادئة.
            </Text>
          </View>
        </FadeIn>
        {!sessionActive || !portal ? (
          <GlassPanel elevated>
            {allowDevLogin ? (
              <>
                <Text style={styles.sectionTitle}>دخول مؤقت (تطوير)</Text>
                <Text style={styles.muted}>
                  بدون OTP — للتجربة المحلية فقط. أدخل رقم جوال مسجّل في النظام.
                </Text>
                <LuxuryField
                  icon="call-outline"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  placeholder="5xxxxxxx"
                />
                <LuxuryButton
                  label={verifyLoading ? 'جاري الدخول…' : 'دخول بدون OTP'}
                  onPress={() => void loginWithoutOtp()}
                  disabled={verifyLoading || loading}
                />
              </>
            ) : (
              <>
                <Text style={styles.sectionTitle}>دخول آمن عبر واتساب</Text>
                <Text style={styles.muted}>
                  أدخل رقم جوالك، ثم استخدم رمز الدخول المرسل على واتساب. الرمز صالح لمدة 10 دقائق.
                </Text>
                <LuxuryField
                  icon="call-outline"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  placeholder="5xxxxxxx"
                />
                <LuxuryButton
                  label={otpLoading ? 'نرسل رمز الدخول…' : 'إرسال رمز الدخول'}
                  onPress={() => void sendOtp()}
                  disabled={otpLoading || verifyLoading || loading}
                />
                {otpNotice ? <Text style={styles.notice}>{otpNotice}</Text> : null}
                {devOtpHint ? (
                  <Text style={styles.devHint}>رمز التجربة: {devOtpHint}</Text>
                ) : null}
                <LuxuryField
                  value={otpCode}
                  onChangeText={setOtpCode}
                  keyboardType="number-pad"
                  textAlign="center"
                  placeholder="••••••"
                  maxLength={6}
                />
                <LuxuryButton
                  label={verifyLoading ? 'نتحقق من الرمز…' : 'تأكيد الدخول'}
                  onPress={() => void confirmOtp()}
                  disabled={verifyLoading || otpLoading || loading}
                />
              </>
            )}
            {allowPhonePreview && !allowDevLogin ? (
              <Pressable
                onPress={() => void loadPreview()}
                disabled={loading || otpLoading || verifyLoading}
                style={styles.devPreview}
              >
                <Text style={styles.devPreviewText}>
                  {loading ? 'جاري التحميل…' : 'معاينة داخلية بدون رمز'}
                </Text>
              </Pressable>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </GlassPanel>
        ) : null}

        {loading && !portal ? (
          <Text style={styles.muted}>نجهّز تفاصيل حسابك…</Text>
        ) : portal ? (
          <>
            <GlassPanel elevated>
              <View style={styles.headerRow}>
                <Pressable onPress={() => void logout()}>
                  <Text style={styles.logout}>تسجيل الخروج</Text>
                </Pressable>
                <View style={styles.headerMeta}>
                  <Text style={styles.customerName}>{portal.customer.displayName ?? portal.customer.phone}</Text>
                  <Text style={styles.muted}>{portal.customer.phone}</Text>
                </View>
              </View>
              <View style={styles.profileBox}>
                <Text style={styles.sectionTitle}>ملف العميل</Text>
                <Text style={styles.muted}>رقم الجوال مرتبط بحسابك ولا يتم تعديله من التطبيق.</Text>
                <LuxuryField
                  label="الاسم الكريم"
                  icon="person-outline"
                  value={profileName}
                  onChangeText={setProfileName}
                  placeholder="اكتب اسمك"
                />
                <View style={styles.readOnlyPhone}>
                  <Text style={styles.readOnlyPhoneLabel}>رقم الجوال</Text>
                  <Text style={styles.readOnlyPhoneValue}>{portal.customer.phone}</Text>
                </View>
                <Text style={styles.sectionTitle}>عناوين التوصيل</Text>
                {profileAddresses.map((item, index) => (
                  <View key={item.id ?? `temp-${index}`} style={styles.addressEditor}>
                    <LuxuryField
                      label={index === 0 ? 'العنوان الافتراضي' : `عنوان ${index + 1}`}
                      icon="location-outline"
                      value={item.address}
                      onChangeText={(value) => updateProfileAddress(index, value)}
                      placeholder="المنطقة · القطعة · الشارع · المنزل"
                    />
                    <Pressable
                      style={styles.removeAddress}
                      onPress={() => removeProfileAddress(index)}
                    >
                      <Text style={styles.removeAddressText}>حذف العنوان</Text>
                    </Pressable>
                  </View>
                ))}
                {profileAddresses.length < 5 ? (
                  <Pressable style={styles.addAddress} onPress={addProfileAddress}>
                    <Text style={styles.addAddressText}>+ إضافة عنوان</Text>
                  </Pressable>
                ) : null}
                <LuxuryButton
                  label={profileSaving ? 'نحفظ التحديث…' : 'حفظ ملف العميل'}
                  onPress={() => void saveProfile()}
                  disabled={profileSaving || !sessionActive}
                />
              </View>
              <View style={styles.finRow}>
                <FinTile
                  label="رصيد الاشتراك"
                  value={formatKwdLabel(portal.financials.walletBalanceKd)}
                />
                <FinTile
                  label="الرصيد المستحق"
                  value={formatKwdLabel(portal.financials.walletDebtKd)}
                />
              </View>
              {portal.financials.subscriptionPlanName ? (
                <Text style={styles.muted}>{portal.financials.subscriptionPlanName}</Text>
              ) : null}
              <LuxuryButton
                label={
                  busyOrderId === '__balance__' ? 'نجهّز الدفع…' : 'دفع الرصيد المستحق'
                }
                onPress={() => void payBalance()}
                disabled={busyOrderId !== null || !sessionActive}
              />
              {!sessionActive ? (
                <Text style={styles.muted}>الدفع يتطلب دخولاً آمناً عبر رمز واتساب.</Text>
              ) : null}
            </GlassPanel>

            <Text style={styles.listTitle}>الفواتير الأخيرة</Text>
            {portal.recentOrders.length === 0 ? (
              <GlassPanel>
                <Text style={styles.sectionTitle}>لا توجد فواتير حالياً</Text>
                <Text style={styles.muted}>
                  ستظهر الفواتير هنا بعد تجهيز طلبك وإصداره.
                </Text>
              </GlassPanel>
            ) : (
              portal.recentOrders.map((item) => (
                <OrderRow
                  key={item.id}
                  order={item}
                  busy={busyOrderId === item.id}
                  onPay={() => void payOrder(item)}
                  payEnabled={sessionActive}
                  onTrack={
                    sessionActive ? () => openOrderDeliveryTrack(item.id) : undefined
                  }
                />
              ))
            )}
          </>
        ) : null}

        <GlassPanel>
          <Text style={styles.sectionTitle}>مركز الدعم</Text>
          <Text style={styles.muted}>
            تحتاج مساعدة؟ تواصل معنا مباشرة وسنعتني بالتفاصيل.
          </Text>
          <View style={styles.supportActions}>
            <Pressable
              style={styles.supportButton}
              onPress={() => void Linking.openURL(`tel:${brand.phone}`)}
            >
              <Text style={styles.supportText}>اتصال</Text>
            </Pressable>
            <Pressable
              style={styles.supportButtonDark}
              onPress={() => void Linking.openURL(`https://wa.me/965${brand.phone}`)}
            >
              <Text style={styles.supportTextDark}>واتساب سفاري</Text>
            </Pressable>
          </View>
        </GlassPanel>

        <GlassPanel>
          <Text style={styles.sectionTitle}>الخصوصية والشروط</Text>
          <Text style={styles.muted}>
            روابط مهمة قبل الإطلاق الرسمي، ويمكن ربطها بصفحات الموقع النهائية.
          </Text>
          <View style={styles.supportActions}>
            <Pressable
              style={styles.supportButton}
              onPress={() => router.push('/policies')}
            >
              <Text style={styles.supportText}>سياسة الخصوصية</Text>
            </Pressable>
            <Pressable
              style={styles.supportButton}
              onPress={() => router.push('/policies')}
            >
              <Text style={styles.supportText}>الشروط</Text>
            </Pressable>
          </View>
        </GlassPanel>

        <GlassPanel>
          <Text style={styles.sectionTitle}>إدارة بيانات الجهاز</Text>
          <Text style={styles.muted}>
            هذه البيانات محفوظة على جهازك فقط لتسريع التجربة.
          </Text>
          <View style={styles.localActions}>
            <Pressable
              style={styles.localAction}
              onPress={() => void clearLocalData('addresses')}
            >
              <Text style={styles.localActionText}>مسح العناوين</Text>
            </Pressable>
            <Pressable
              style={styles.localAction}
              onPress={() => void clearLocalData('favorites')}
            >
              <Text style={styles.localActionText}>مسح المفضلة</Text>
            </Pressable>
            <Pressable
              style={styles.localAction}
              onPress={() => void clearLocalData('ratings')}
            >
              <Text style={styles.localActionText}>مسح التقييمات</Text>
            </Pressable>
          </View>
        </GlassPanel>
      </LuxuryScroll>
    </LuxuryScreen>
  );
}

function FinTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.finTile}>
      <Text style={styles.finLabel}>{label}</Text>
      <Text style={styles.finValue}>{value}</Text>
    </View>
  );
}

function OrderRow({
  order,
  busy,
  onPay,
  payEnabled,
  onTrack,
}: {
  order: CustomerPortalOrder;
  busy: boolean;
  onPay: () => void;
  payEnabled: boolean;
  onTrack?: () => void;
}) {
  const label =
    order.serialNumber ?? order.invoiceNumber ?? order.id.slice(0, 8);
  const canPay =
    payEnabled &&
    order.paymentStatus !== 'PAID' &&
    Number.parseFloat(order.remainingAmountKd) > 0;
  const deliveryLabel = order.deliveryStatus
    ? deliveryStatusLabelAr(order.deliveryStatus)
    : null;

  return (
    <View style={styles.orderRow}>
      <View style={styles.orderMeta}>
        <Text style={styles.orderId}>{label}</Text>
        <Text style={styles.orderAmount}>
          {formatKwdLabel(order.remainingAmountKd)} · {order.paymentStatus}
        </Text>
        {deliveryLabel ? (
          <Text style={styles.deliveryStatus}>{deliveryLabel}</Text>
        ) : (
          <Text style={styles.muted}>{order.status}</Text>
        )}
      </View>
      <View style={styles.orderActions}>
        {onTrack ? (
          <Pressable style={styles.trackBtn} onPress={onTrack}>
            <Text style={styles.trackBtnText}>تتبع</Text>
          </Pressable>
        ) : null}
        {canPay ? (
          <Pressable style={styles.payBtn} onPress={onPay} disabled={busy}>
            <Text style={styles.payBtnText}>{busy ? '...' : 'دفع'}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  orbTop: { top: -70, right: -80 },
  orbBottom: { bottom: 110, left: -70 },
  wrap: { gap: luxury.space.lg },
  hero: {
    minHeight: 190,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    gap: luxury.space.sm,
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
  customerName: {
    color: luxury.color.graphite,
    fontSize: luxury.type.section,
    fontWeight: '900',
    textAlign: 'right',
  },
  muted: {
    color: luxury.color.slate,
    fontSize: luxury.type.caption,
    lineHeight: luxury.lineHeight.caption,
    textAlign: 'right',
  },
  error: { color: luxury.color.danger, textAlign: 'right' },
  notice: {
    color: luxury.color.blue600,
    textAlign: 'right',
    fontSize: 13,
    lineHeight: 20,
  },
  devHint: {
    textAlign: 'center',
    color: luxury.color.warning,
    backgroundColor: luxury.color.champagneSoft,
    padding: 8,
    borderRadius: 8,
    fontWeight: '700',
  },
  devPreview: {
    paddingVertical: 8,
    alignItems: 'flex-end',
  },
  devPreviewText: {
    color: luxury.color.slate,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  headerRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  headerMeta: { flex: 1, alignItems: 'flex-end', gap: 2 },
  logout: { color: luxury.color.danger, fontWeight: '700' },
  profileBox: {
    gap: 12,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: luxury.color.line,
  },
  readOnlyPhone: {
    alignItems: 'flex-end',
    backgroundColor: 'rgba(15,17,21,0.045)',
    borderRadius: luxury.radius.md,
    padding: 12,
    gap: 4,
  },
  readOnlyPhoneLabel: { color: luxury.color.slate, fontSize: 12 },
  readOnlyPhoneValue: {
    color: luxury.color.graphite,
    fontSize: 16,
    fontWeight: '900',
  },
  addressEditor: { gap: 8 },
  removeAddress: { alignSelf: 'flex-end' },
  removeAddressText: {
    color: luxury.color.danger,
    fontSize: 12,
    fontWeight: '800',
  },
  addAddress: {
    alignSelf: 'flex-end',
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  addAddressText: {
    color: luxury.color.blue600,
    fontWeight: '900',
  },
  finRow: { flexDirection: 'row-reverse', gap: 8 },
  finTile: {
    flex: 1,
    backgroundColor: 'rgba(15,17,21,0.045)',
    borderRadius: luxury.radius.md,
    padding: 12,
    alignItems: 'flex-end',
    gap: 4,
  },
  finLabel: { fontSize: 11, color: luxury.color.slate },
  finValue: { fontSize: 16, fontWeight: '900', color: luxury.color.graphite },
  list: { gap: luxury.space.sm, paddingBottom: 24 },
  listTitle: {
    color: luxury.color.graphite,
    fontSize: luxury.type.headline,
    fontWeight: '900',
    textAlign: 'right',
    marginBottom: luxury.space.xs,
  },
  orderRow: {
    backgroundColor: luxury.color.glassStrong,
    borderRadius: luxury.radius.lg,
    padding: 12,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: luxury.color.line,
  },
  orderMeta: { flex: 1, alignItems: 'flex-end', gap: 2 },
  orderId: { fontWeight: '900', color: luxury.color.graphite },
  orderAmount: { color: luxury.color.blue600, fontWeight: '800' },
  deliveryStatus: {
    color: luxury.color.blue600,
    fontWeight: '700',
    fontSize: 12,
  },
  orderActions: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  trackBtn: {
    borderRadius: luxury.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: luxury.color.line,
    backgroundColor: luxury.color.ice100,
  },
  trackBtnText: { color: luxury.color.graphite, fontWeight: '800', fontSize: 12 },
  payBtn: {
    backgroundColor: luxury.color.blue600,
    borderRadius: luxury.radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  payBtnText: { color: luxury.color.warmWhite, fontWeight: '900' },
  supportActions: {
    flexDirection: 'row-reverse',
    gap: luxury.space.sm,
  },
  supportButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: luxury.radius.pill,
    backgroundColor: luxury.color.ice100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportButtonDark: {
    flex: 1,
    minHeight: 46,
    borderRadius: luxury.radius.pill,
    backgroundColor: luxury.color.navy900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportText: {
    color: luxury.color.blue600,
    fontWeight: '900',
  },
  supportTextDark: {
    color: luxury.color.warmWhite,
    fontWeight: '900',
  },
  localActions: {
    gap: luxury.space.sm,
  },
  localAction: {
    minHeight: 44,
    borderRadius: luxury.radius.pill,
    backgroundColor: 'rgba(15,17,21,0.045)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  localActionText: {
    color: luxury.color.graphite,
    fontWeight: '900',
  },
});

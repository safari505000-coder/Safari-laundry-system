import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { posCheckout } from '@/api/pos';
import type {
  LaundryPriceListItemRow,
  PosCartLine,
  PosCustomerRow,
  PosPaymentMethod,
} from '@/api/pos-types';
import { ensureDriverShift } from '@/api/orders';
import { fetchOperatingStatus, type OperatingStatusPayload } from '@/api/system';
import { useAuth } from '@/auth/auth-context';
import { PosCartSheet } from '@/components/driver/pos/pos-cart-sheet';
import { PosCatalogGrid } from '@/components/driver/pos/pos-catalog-grid';
import { PosCustomerBar } from '@/components/driver/pos/pos-customer-bar';
import { PosServiceSheet } from '@/components/driver/pos/pos-service-sheet';
import { DriverChrome } from '@/components/driver/driver-chrome';
import { MutedText, SectionHeader } from '@/components/ui';
import { usePosPriceList } from '@/hooks/use-pos-price-list';
import {
  addOrMergeCartLine,
  buildCheckoutRequest,
  DELIVERY_FEE_KD,
  formatPreviewKd,
  sumLinesKd,
} from '@/lib/pos-pricing';
import { brand } from '@/theme/brand';

export default function DriverPosScreen() {
  const { getValidAccessToken } = useAuth();
  const catalog = usePosPriceList();
  const [operating, setOperating] = useState<OperatingStatusPayload | null>(
    null,
  );
  const [customer, setCustomer] = useState<PosCustomerRow | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [cartLines, setCartLines] = useState<PosCartLine[]>([]);
  const [paymentMethod, setPaymentMethod] =
    useState<PosPaymentMethod>('CASH');
  const [serviceItem, setServiceItem] =
    useState<LaundryPriceListItemRow | null>(null);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);

  useEffect(() => {
    void fetchOperatingStatus().then(setOperating).catch(() => setOperating(null));
    void (async () => {
      const token = await getValidAccessToken();
      if (token) {
        await ensureDriverShift(token).catch(() => undefined);
      }
    })();
  }, [getValidAccessToken]);

  const lineSum = sumLinesKd(cartLines);
  const delivery = lineSum > 0 ? DELIVERY_FEE_KD : 0;
  const netTotal = lineSum + delivery;
  const pieceCount = useMemo(
    () => cartLines.reduce((sum, line) => sum + line.quantity, 0),
    [cartLines],
  );

  const systemClosed =
    operating?.lockEnabled !== false && operating?.isOpen === false;

  const addLines = useCallback((lines: PosCartLine[]) => {
    setCartLines((prev) =>
      lines.reduce((acc, line) => addOrMergeCartLine(acc, line), prev),
    );
  }, []);

  const changeQty = useCallback((lineKey: string, qty: number) => {
    setCartLines((prev) =>
      qty < 1
        ? prev.filter((line) => line.lineKey !== lineKey)
        : prev.map((line) =>
            line.lineKey === lineKey ? { ...line, quantity: qty } : line,
          ),
    );
  }, []);

  const checkout = useCallback(async () => {
    if (!customer) {
      Alert.alert('اختر عميلاً', 'يجب اختيار عميل قبل إتمام البيع.');
      return;
    }
    if (cartLines.length === 0) {
      Alert.alert('السلة فارغة', 'أضف أصنافاً من قائمة الأسعار.');
      return;
    }
    if (systemClosed) {
      Alert.alert('النظام مغلق', 'لا يمكن إصدار فواتير حالياً.');
      return;
    }

    setCheckoutBusy(true);
    try {
      const token = await getValidAccessToken();
      if (!token) {
        throw new Error('انتهت الجلسة');
      }
      const body = buildCheckoutRequest(customer, cartLines, paymentMethod);
      const created = await posCheckout(token, body);
      const label =
        created.serialNumber ??
        created.invoiceNumber ??
        created.id.slice(0, 8);
      if (created.paymentLink?.url) {
        Alert.alert('تم — رابط دفع', label, [
          {
            text: 'فتح الرابط',
            onPress: () => void Linking.openURL(created.paymentLink!.url),
          },
          { text: 'حسناً' },
        ]);
      } else {
        Alert.alert('تم البيع', `الفاتورة: ${label}`);
      }
      setCartLines([]);
      setCartOpen(false);
    } catch (err) {
      Alert.alert(
        'فشل',
        err instanceof Error ? err.message : 'تعذر إتمام البيع',
      );
    } finally {
      setCheckoutBusy(false);
    }
  }, [
    cartLines,
    customer,
    getValidAccessToken,
    paymentMethod,
    systemClosed,
  ]);

  return (
    <DriverChrome title="POS — قائمة الأسعار">
      <View style={styles.wrap}>
        <SectionHeader
          eyebrow="Mobile POS"
          title="نقطة البيع"
          subtitle="أسعار مباشرة من النظام وإصدار الفاتورة عبر السيرفر"
        />
        {operating ? (
          <View
            style={[
              styles.banner,
              systemClosed ? styles.bannerClosed : styles.bannerOpen,
            ]}
          >
            <Text
              style={[
                styles.bannerText,
                systemClosed ? styles.bannerTextClosed : styles.bannerTextOpen,
              ]}
            >
              {systemClosed
                ? `النظام مغلق — ${operating.kuwaitTimeLabel}`
                : `اليوم المالي: ${operating.financialDateLabel}`}
            </Text>
          </View>
        ) : null}

        <PosCustomerBar selected={customer} onSelect={setCustomer} />

        {catalog.loading ? (
          <ActivityIndicator color={brand.colors.primaryBlue} size="large" />
        ) : catalog.error ? (
          <Text style={styles.error}>{catalog.error}</Text>
        ) : (
          <PosCatalogGrid
            items={catalog.items}
            categories={catalog.categories}
            categoryId={categoryId}
            onCategoryChange={setCategoryId}
            onItemPress={(item) => {
              setServiceItem(item);
              setServiceOpen(true);
            }}
          />
        )}

        <Pressable
          style={styles.peekBar}
          onPress={() => setCartOpen(true)}
          disabled={systemClosed}
        >
          <Text style={styles.peekTotal}>{formatPreviewKd(netTotal)}</Text>
          <Text style={styles.peekMeta}>
            {pieceCount} قطعة · اضغط للسلة والدفع
          </Text>
        </Pressable>

        <MutedText>
          أسعار من /laundry-price-list · البيع عبر /pos/checkout
        </MutedText>
      </View>

      <PosServiceSheet
        item={serviceItem}
        visible={serviceOpen}
        onClose={() => setServiceOpen(false)}
        onAdd={addLines}
      />

      <PosCartSheet
        visible={cartOpen}
        lines={cartLines}
        hasCustomer={customer !== null}
        systemClosed={systemClosed}
        paymentMethod={paymentMethod}
        onPaymentChange={setPaymentMethod}
        onClose={() => setCartOpen(false)}
        onQtyChange={changeQty}
        onCheckout={() => void checkout()}
        checkoutBusy={checkoutBusy}
      />
    </DriverChrome>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: 10 },
  banner: { borderRadius: brand.radius.md, padding: 10 },
  bannerOpen: { backgroundColor: brand.colors.successSoft },
  bannerClosed: { backgroundColor: brand.colors.dangerSoft },
  bannerText: { textAlign: 'right', fontSize: 13, fontWeight: '800' },
  bannerTextOpen: { color: '#166534' },
  bannerTextClosed: { color: '#991B1B' },
  error: { color: brand.colors.danger, textAlign: 'right' },
  peekBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 96,
    backgroundColor: brand.colors.darkBlue,
    borderRadius: brand.radius.lg,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'flex-end',
    gap: 2,
  },
  peekTotal: {
    color: brand.colors.white,
    fontSize: 20,
    fontWeight: '900',
  },
  peekMeta: {
    color: brand.colors.lightCyan,
    fontSize: 12,
  },
});

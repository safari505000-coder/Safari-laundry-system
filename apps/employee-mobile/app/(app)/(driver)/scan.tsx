import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '@/auth/auth-context';
import { fetchOrderById } from '@/api/orders';
import { DriverChrome } from '@/components/driver/driver-chrome';
import { MutedText, PrimaryButton, SectionHeader, SurfaceCard } from '@/components/ui';
import { normalizeScannedOrderId } from '@/lib/order-scan';
import { brand } from '@/theme/brand';

export default function DriverScanScreen() {
  const { getValidAccessToken } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);

  const lookup = useCallback(
    async (raw: string) => {
      const id = normalizeScannedOrderId(raw);
      if (!id) {
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const token = await getValidAccessToken();
        if (!token) {
          throw new Error('انتهت الجلسة');
        }
        await fetchOrderById(token, id);
        router.push(`/(app)/(driver)/order/${id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'لم يُعثر على الفاتورة');
        setScanned(false);
      } finally {
        setBusy(false);
      }
    },
    [getValidAccessToken],
  );

  if (!permission) {
    return (
      <DriverChrome title="مسح فاتورة">
        <ActivityIndicator color={brand.colors.primaryBlue} />
      </DriverChrome>
    );
  }

  return (
    <DriverChrome title="مسح فاتورة">
      <View style={styles.wrap}>
        <SectionHeader
          eyebrow="Field Scan"
          title="مسح الفاتورة"
          subtitle="افتح الطلب من الباركود أو الرقم اليدوي"
        />
        <MutedText>
          امسح باركود الفاتورة أو أدخل رقم الطلب يدوياً — GET /orders/:id
        </MutedText>

        {permission.granted ? (
          <View style={styles.cameraBox}>
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ['qr', 'code128', 'code39', 'ean13'],
              }}
              onBarcodeScanned={
                scanned || busy
                  ? undefined
                  : ({ data }) => {
                      setScanned(true);
                      void lookup(data);
                    }
              }
            />
            {busy ? (
              <View style={styles.cameraOverlay}>
                <ActivityIndicator color={brand.colors.white} size="large" />
              </View>
            ) : null}
          </View>
        ) : (
          <PrimaryButton
            label="السماح بالكamera"
            onPress={() => void requestPermission()}
          />
        )}

        <SurfaceCard>
          <Text style={styles.label}>أو أدخل المعرّف يدوياً</Text>
          <TextInput
            value={manual}
            onChangeText={setManual}
            textAlign="right"
            style={styles.input}
            placeholder="UUID أو رقم الفاتورة"
            placeholderTextColor={brand.colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <PrimaryButton
            label={busy ? 'جاري البحث…' : 'بحث'}
            onPress={() => void lookup(manual)}
            disabled={busy || !manual.trim()}
          />
        </SurfaceCard>

        {scanned && !busy ? (
          <Pressable onPress={() => setScanned(false)}>
            <Text style={styles.rescan}>مسح مرة أخرى</Text>
          </Pressable>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </DriverChrome>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: 12 },
  cameraBox: {
    height: 260,
    borderRadius: brand.radius.xl,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  camera: { flex: 1 },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 13,
    fontWeight: '800',
    color: brand.colors.text,
    textAlign: 'right',
  },
  input: {
    backgroundColor: brand.colors.surfaceMuted,
    borderRadius: brand.radius.md,
    borderWidth: 1,
    borderColor: brand.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: brand.colors.text,
  },
  rescan: {
    textAlign: 'center',
    color: brand.colors.primaryBlue,
    fontWeight: '800',
  },
  error: { color: brand.colors.danger, textAlign: 'right' },
});

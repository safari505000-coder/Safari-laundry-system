import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { LaundryPriceListItemRow, PosServiceKey } from '@/api/pos-types';
import { PrimaryButton } from '@/components/ui';
import {
  formatPreviewKd,
  serviceOptionsForItem,
  type ServiceOption,
} from '@/lib/pos-pricing';
import type { PosCartLine } from '@/api/pos-types';
import { brand } from '@/theme/brand';

export function PosServiceSheet({
  item,
  visible,
  onClose,
  onAdd,
}: {
  item: LaundryPriceListItemRow | null;
  visible: boolean;
  onClose: () => void;
  onAdd: (lines: PosCartLine[]) => void;
}) {
  const options = useMemo(
    () => (item ? serviceOptionsForItem(item) : []),
    [item],
  );
  const [qty, setQty] = useState<Record<PosServiceKey, number>>({
    NORMAL: 0,
    URGENT: 0,
    PRESS_ONLY: 0,
    URGENT_PRESS: 0,
  });
  const [manualPrice, setManualPrice] = useState('');

  useEffect(() => {
    if (visible && item) {
      setQty({ NORMAL: 1, URGENT: 0, PRESS_ONLY: 0, URGENT_PRESS: 0 });
      setManualPrice('');
    }
  }, [visible, item]);

  if (!item) {
    return null;
  }

  const manualEntry = item.manualEntry === true;
  const selected = options.filter((opt) => opt.available && qty[opt.key] > 0);
  const needsManual =
    manualEntry || selected.some((opt) => opt.price <= 0);
  const manualParsed = Number.parseFloat(manualPrice.replace(',', '.'));

  function changeQty(key: PosServiceKey, delta: number) {
    setQty((prev) => ({
      ...prev,
      [key]: Math.max(0, prev[key] + delta),
    }));
  }

  function confirm() {
    if (!item) {
      return;
    }
    if (selected.length === 0) {
      return;
    }
    if (needsManual && (!Number.isFinite(manualParsed) || manualParsed <= 0)) {
      return;
    }
    const lines: PosCartLine[] = selected.map((opt: ServiceOption) => {
      const unitPrice =
        manualEntry || opt.price <= 0 ? manualParsed : opt.price;
      return {
        lineKey: `${item.id}:${opt.key}:${unitPrice}`,
        laundryId: item.id,
        nameAr: `${item.nameAr} — ${opt.labelAr}`,
        serviceKey: opt.key,
        serviceLabel: opt.labelAr,
        unitPrice,
        quantity: qty[opt.key],
      };
    });
    onAdd(lines);
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{item.nameAr}</Text>
          {options
            .filter((opt) => opt.available)
            .map((opt) => (
              <View key={opt.key} style={styles.row}>
                <View style={styles.qtyControls}>
                  <Pressable
                    onPress={() => changeQty(opt.key, -1)}
                    style={styles.qtyBtn}
                  >
                    <Text style={styles.qtyBtnText}>−</Text>
                  </Pressable>
                  <Text style={styles.qtyValue}>{qty[opt.key]}</Text>
                  <Pressable
                    onPress={() => changeQty(opt.key, 1)}
                    style={styles.qtyBtn}
                  >
                    <Text style={styles.qtyBtnText}>+</Text>
                  </Pressable>
                </View>
                <View style={styles.rowMeta}>
                  <Text style={styles.rowLabel}>{opt.labelAr}</Text>
                  <Text style={styles.rowPrice}>
                    {formatPreviewKd(opt.price)}
                  </Text>
                </View>
              </View>
            ))}
          {needsManual ? (
            <>
              <Text style={styles.manualLabel}>سعر الوحدة (د.ك)</Text>
              <TextInput
                value={manualPrice}
                onChangeText={setManualPrice}
                keyboardType="decimal-pad"
                textAlign="right"
                style={styles.input}
                placeholder="0.000"
                placeholderTextColor={brand.colors.textMuted}
              />
            </>
          ) : null}
          <View style={styles.actions}>
            <PrimaryButton label="إضافة للسلة" onPress={confirm} />
            <Pressable onPress={onClose}>
              <Text style={styles.cancel}>إلغاء</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: brand.colors.surface,
    borderTopLeftRadius: brand.radius.xl,
    borderTopRightRadius: brand.radius.xl,
    padding: 16,
    gap: 12,
    maxHeight: '80%',
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'right',
    color: brand.colors.text,
  },
  row: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  rowMeta: { flex: 1, alignItems: 'flex-end', gap: 2 },
  rowLabel: { fontSize: 14, fontWeight: '800', color: brand.colors.text },
  rowPrice: { fontSize: 12, color: brand.colors.textMuted },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: brand.radius.sm,
    backgroundColor: brand.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: { fontSize: 18, fontWeight: '700', color: brand.colors.text },
  qtyValue: { minWidth: 24, textAlign: 'center', fontWeight: '700' },
  manualLabel: {
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '600',
    color: brand.colors.text,
  },
  input: {
    borderWidth: 1,
    borderColor: brand.colors.border,
    borderRadius: brand.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: brand.colors.text,
  },
  actions: { gap: 10, paddingTop: 4 },
  cancel: {
    textAlign: 'center',
    color: brand.colors.textMuted,
    paddingVertical: 8,
  },
});

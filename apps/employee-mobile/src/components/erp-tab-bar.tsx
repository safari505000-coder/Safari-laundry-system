import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { brand } from '@/theme/brand';

type IconKind =
  | 'tasks'
  | 'scan'
  | 'invoice'
  | 'cash'
  | 'pos'
  | 'search'
  | 'orders'
  | 'dashboard'
  | 'drivers'
  | 'more';

const ICON_BY_ROUTE: Record<string, IconKind> = {
  tasks: 'tasks',
  scan: 'scan',
  'pending-invoices': 'invoice',
  deposits: 'cash',
  pos: 'pos',
  index: 'dashboard',
  collections: 'cash',
  'website-orders': 'orders',
  'website-payments': 'invoice',
  oversight: 'drivers',
  custody: 'cash',
  more: 'more',
  expense: 'cash',
};

export function ErpBottomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const visibleRoutes = state.routes.filter((route) => {
    if (route.name.includes('[')) {
      return false;
    }
    const options = descriptors[route.key]?.options;
    return (options as { href?: unknown } | undefined)?.href !== null;
  });
  const compact = visibleRoutes.length >= 6;

  return (
    <View style={styles.wrap}>
      <View style={[styles.rail, compact && styles.railCompact]}>
        {visibleRoutes.map((route) => {
          const descriptor = descriptors[route.key];
          const options = descriptor.options;
          const index = state.routes.findIndex((item) => item.key === route.key);
          const focused = state.index === index;
          const title =
            typeof options.title === 'string'
              ? options.title
              : typeof options.tabBarLabel === 'string'
                ? options.tabBarLabel
                : route.name;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });

                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(route.name, route.params);
                }
              }}
              onLongPress={() => {
                navigation.emit({
                  type: 'tabLongPress',
                  target: route.key,
                });
              }}
              style={[
                styles.item,
                compact && styles.itemCompact,
                focused && styles.itemFocused,
              ]}
            >
              <MiniIcon
                kind={ICON_BY_ROUTE[route.name] ?? 'dashboard'}
                focused={focused}
                compact={compact}
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.label,
                  compact && styles.labelCompact,
                  focused && styles.labelFocused,
                ]}
              >
                {title}
              </Text>
              {focused ? <View style={styles.activeDot} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function MiniIcon({
  kind,
  focused,
  compact,
}: {
  kind: IconKind;
  focused: boolean;
  compact: boolean;
}) {
  return (
    <View
      style={[
        styles.iconBox,
        compact && styles.iconBoxCompact,
        focused && styles.iconBoxFocused,
      ]}
    >
      {kind === 'tasks' ? <TaskIcon focused={focused} /> : null}
      {kind === 'scan' ? <ScanIcon focused={focused} /> : null}
      {kind === 'invoice' ? <InvoiceIcon focused={focused} /> : null}
      {kind === 'cash' ? <CashIcon focused={focused} /> : null}
      {kind === 'pos' ? <PosIcon focused={focused} /> : null}
      {kind === 'search' ? <SearchIcon focused={focused} /> : null}
      {kind === 'orders' ? <OrdersIcon focused={focused} /> : null}
      {kind === 'dashboard' ? <DashboardIcon focused={focused} /> : null}
      {kind === 'drivers' ? <DriversIcon focused={focused} /> : null}
      {kind === 'more' ? <MoreIcon focused={focused} /> : null}
    </View>
  );
}

function iconColor(focused: boolean) {
  return focused ? brand.colors.goldSoft : brand.colors.textMuted;
}

function Stroke({ style, focused }: { style: object; focused: boolean }) {
  return <View style={[styles.stroke, { backgroundColor: iconColor(focused) }, style]} />;
}

function TaskIcon({ focused }: { focused: boolean }) {
  return (
    <View style={styles.iconCanvas}>
      <Stroke focused={focused} style={styles.taskLineWide} />
      <Stroke focused={focused} style={styles.taskLineMid} />
      <Stroke focused={focused} style={styles.taskLineSmall} />
    </View>
  );
}

function ScanIcon({ focused }: { focused: boolean }) {
  return (
    <View style={styles.iconCanvas}>
      <Stroke focused={focused} style={styles.scanTop} />
      <Stroke focused={focused} style={styles.scanBottom} />
      <Stroke focused={focused} style={styles.scanBeam} />
    </View>
  );
}

function InvoiceIcon({ focused }: { focused: boolean }) {
  return (
    <View style={styles.iconCanvas}>
      <View style={[styles.invoicePage, { borderColor: iconColor(focused) }]}>
        <Stroke focused={focused} style={styles.invoiceLineOne} />
        <Stroke focused={focused} style={styles.invoiceLineTwo} />
      </View>
    </View>
  );
}

function CashIcon({ focused }: { focused: boolean }) {
  return (
    <View style={styles.iconCanvas}>
      <View style={[styles.cashNote, { borderColor: iconColor(focused) }]}>
        <View style={[styles.cashDot, { backgroundColor: iconColor(focused) }]} />
      </View>
    </View>
  );
}

function PosIcon({ focused }: { focused: boolean }) {
  return (
    <View style={styles.iconCanvas}>
      <View style={[styles.posScreen, { borderColor: iconColor(focused) }]} />
      <Stroke focused={focused} style={styles.posBase} />
    </View>
  );
}

function SearchIcon({ focused }: { focused: boolean }) {
  return (
    <View style={styles.iconCanvas}>
      <View style={[styles.searchCircle, { borderColor: iconColor(focused) }]} />
      <Stroke focused={focused} style={styles.searchHandle} />
    </View>
  );
}

function OrdersIcon({ focused }: { focused: boolean }) {
  return (
    <View style={styles.iconCanvas}>
      <View style={[styles.orderBox, { borderColor: iconColor(focused) }]} />
      <Stroke focused={focused} style={styles.orderLid} />
    </View>
  );
}

function DashboardIcon({ focused }: { focused: boolean }) {
  return (
    <View style={styles.dashboardGrid}>
      {[0, 1, 2, 3].map((item) => (
        <View
          key={item}
          style={[styles.dashboardCell, { backgroundColor: iconColor(focused) }]}
        />
      ))}
    </View>
  );
}

function DriversIcon({ focused }: { focused: boolean }) {
  return (
    <View style={styles.iconCanvas}>
      <View style={[styles.driverHead, { backgroundColor: iconColor(focused) }]} />
      <Stroke focused={focused} style={styles.driverShoulder} />
    </View>
  );
}

function MoreIcon({ focused }: { focused: boolean }) {
  return (
    <View style={styles.moreRow}>
      {[0, 1, 2].map((item) => (
        <View
          key={item}
          style={[styles.moreDot, { backgroundColor: iconColor(focused) }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 12,
    paddingHorizontal: 12,
  },
  rail: {
    minHeight: 76,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderWidth: 1,
    borderColor: brand.colors.border,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 7,
  },
  railCompact: {
    minHeight: 68,
    borderRadius: 24,
    padding: 5,
  },
  item: {
    flex: 1,
    minHeight: 62,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  itemCompact: {
    minHeight: 56,
    borderRadius: 18,
    gap: 2,
  },
  itemFocused: {
    backgroundColor: brand.colors.darkBlue,
  },
  label: {
    color: brand.colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
  },
  labelCompact: {
    fontSize: 9,
  },
  labelFocused: {
    color: brand.colors.white,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 999,
    backgroundColor: brand.colors.gold,
  },
  iconBox: {
    width: 30,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxCompact: {
    width: 24,
    height: 20,
    transform: [{ scale: 0.9 }],
  },
  iconBoxFocused: {
    transform: [{ translateY: -1 }],
  },
  iconCanvas: {
    width: 22,
    height: 20,
  },
  stroke: {
    position: 'absolute',
    height: 2,
    borderRadius: 999,
  },
  taskLineWide: { top: 3, right: 2, width: 18 },
  taskLineMid: { top: 9, right: 2, width: 14 },
  taskLineSmall: { top: 15, right: 2, width: 10 },
  scanTop: { top: 3, left: 3, width: 16 },
  scanBottom: { bottom: 3, left: 3, width: 16 },
  scanBeam: { top: 9, left: 1, width: 20 },
  invoicePage: {
    width: 16,
    height: 19,
    borderWidth: 2,
    borderRadius: 5,
    marginLeft: 3,
  },
  invoiceLineOne: { top: 6, left: 3, width: 8 },
  invoiceLineTwo: { top: 11, left: 3, width: 10 },
  cashNote: {
    width: 20,
    height: 14,
    borderWidth: 2,
    borderRadius: 6,
    marginTop: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cashDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
  },
  posScreen: {
    width: 16,
    height: 13,
    borderWidth: 2,
    borderRadius: 4,
    marginLeft: 3,
  },
  posBase: { bottom: 2, left: 5, width: 12 },
  searchCircle: {
    width: 13,
    height: 13,
    borderRadius: 999,
    borderWidth: 2,
    marginLeft: 2,
    marginTop: 1,
  },
  searchHandle: {
    width: 8,
    transform: [{ rotate: '45deg' }],
    right: 1,
    bottom: 3,
  },
  orderBox: {
    width: 17,
    height: 14,
    borderWidth: 2,
    borderRadius: 4,
    marginTop: 5,
    marginLeft: 2,
  },
  orderLid: { top: 2, left: 5, width: 12 },
  dashboardGrid: {
    width: 18,
    height: 18,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
  },
  dashboardCell: {
    width: 7,
    height: 7,
    borderRadius: 2,
  },
  driverHead: {
    width: 8,
    height: 8,
    borderRadius: 999,
    alignSelf: 'center',
    marginTop: 2,
  },
  driverShoulder: { bottom: 3, left: 4, width: 14 },
  moreRow: {
    flexDirection: 'row',
    gap: 3,
  },
  moreDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
  },
});

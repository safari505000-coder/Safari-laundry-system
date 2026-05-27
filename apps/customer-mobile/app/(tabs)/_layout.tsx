import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OrderCartProvider, useOrderCart } from '@/cart/order-cart';
import { useCustomerPushRegistration } from '@/device/use-customer-push';
import { luxury } from '@/design/luxury-tokens';

const TAB_BASE = Platform.OS === 'ios' ? 49 : 56;

function TabsWithBadge() {
  useCustomerPushRegistration();
  const insets = useSafeAreaInsets();
  const { totalItems } = useOrderCart();
  const tabBarHeight = TAB_BASE + Math.max(insets.bottom, Platform.OS === 'android' ? 8 : 0);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: luxury.color.blue600,
        tabBarInactiveTintColor: luxury.color.silver,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarItemStyle: { paddingTop: 4 },
        tabBarStyle: {
          backgroundColor: 'rgba(251,250,247,0.96)',
          borderTopWidth: 0,
          height: tabBarHeight,
          paddingBottom: Math.max(insets.bottom, 6),
          paddingTop: 6,
          shadowColor: luxury.color.navy950,
          shadowOffset: { width: 0, height: -10 },
          shadowOpacity: 0.08,
          shadowRadius: 24,
          elevation: 16,
        },
        tabBarBadgeStyle: {
          backgroundColor: luxury.color.navy900,
          color: luxury.color.warmWhite,
          fontWeight: '900',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'الرئيسية',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="services"
        options={{
          title: 'الخدمات',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="sparkles" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="order"
        options={{
          title: 'السلة',
          tabBarBadge: totalItems > 0 ? (totalItems > 99 ? '99+' : totalItems) : undefined,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="basket" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="track"
        options={{
          title: 'طلباتي',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="receipt" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'حسابي',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

export default function TabsLayout() {
  return (
    <OrderCartProvider>
      <TabsWithBadge />
    </OrderCartProvider>
  );
}

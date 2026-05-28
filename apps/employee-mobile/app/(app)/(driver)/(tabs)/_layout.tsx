import { Tabs } from 'expo-router';
import { ErpBottomTabBar } from '@/components/erp-tab-bar';
import { erpTabScreenOptions } from '@/components/ui';

export default function DriverTabsLayout() {
  return (
    <Tabs
      screenOptions={erpTabScreenOptions}
      tabBar={(props) => <ErpBottomTabBar {...props} />}
    >
      <Tabs.Screen name="tasks" options={{ title: 'مهامي' }} />
      <Tabs.Screen name="scan" options={{ title: 'مسح' }} />
      <Tabs.Screen name="pending-invoices" options={{ title: 'متابعة' }} />
      <Tabs.Screen name="deposits" options={{ title: 'عهدة' }} />
      <Tabs.Screen name="pos" options={{ title: 'POS' }} />
      <Tabs.Screen name="more" options={{ title: 'المزيد' }} />
    </Tabs>
  );
}

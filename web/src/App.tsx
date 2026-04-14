import { useTranslation } from 'react-i18next';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/contexts/auth-context';
import { AuthLayout } from '@/components/layout/auth-layout';
import { ExecutiveShell } from '@/components/layout/executive-shell';
import { RequireAuth } from '@/components/require-auth';
import { Toaster } from '@/components/ui/sonner';
import { DashboardPage } from '@/pages/dashboard-page';
import { FinancialsPage } from '@/pages/financials-page';
import { LoginPage } from '@/pages/login-page';
import { OrdersPage } from '@/pages/orders-page';
import { ShiftsPage } from '@/pages/shifts-page';
import { SubscribersPage } from '@/pages/subscribers-page';
import { SubscriptionsPage } from '@/pages/subscriptions-page';
import { TeamPage } from '@/pages/team-page';
import { PosPage } from '@/pages/pos-page';

function AppToaster() {
  const { i18n } = useTranslation();
  const rtl = i18n.language.startsWith('ar');
  return (
    <Toaster richColors position={rtl ? 'top-left' : 'top-right'} />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <AuthLayout />
              </RequireAuth>
            }
          >
            <Route path="/pos" element={<PosPage />} />
            <Route path="/" element={<ExecutiveShell />}>
              <Route index element={<DashboardPage />} />
              <Route path="subscriptions" element={<SubscriptionsPage />} />
              <Route path="subscribers" element={<SubscribersPage />} />
              <Route path="orders" element={<OrdersPage />} />
              <Route path="shifts" element={<ShiftsPage />} />
              <Route path="financials" element={<FinancialsPage />} />
              <Route path="team" element={<TeamPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <AppToaster />
    </AuthProvider>
  );
}

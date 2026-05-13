import { useMemo } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutGrid, Wallet } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/modules/shared/auth/access-matrix';
import { PageHeader } from '@/modules/shared/components/page';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/modules/shared/components/ui/tabs';
import { cn } from '@/lib/utils';
import { CollectionsCockpitView } from '@/modules/call-center/pages/collections-cockpit-view';
import { CollectionsReportView } from '@/modules/call-center/collections-report/pages/collections-report-view';

const TAB_WORK = 'work';
const TAB_REPORT = 'report';

/**
 * Unified collections hub — operational cockpit + AR report (`/collections/center`).
 */
export function CollectionsCenterPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const canAccess =
    user != null &&
    (can(user, 'outstanding.view') || can(user, 'collections.view'));

  const canDoActions = user != null && can(user, 'collections.act');

  const defaultTab = useMemo(() => {
    if (!user) return TAB_WORK;
    return can(user, 'collections.view') ? TAB_WORK : TAB_REPORT;
  }, [user]);

  const requestedTab = searchParams.get('tab');

  const activeTab =
    requestedTab === TAB_REPORT || requestedTab === TAB_WORK ?
      requestedTab
    : defaultTab;

  const handleTabChange = (value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', value);
        return next;
      },
      { replace: true },
    );
  };

  if (!canAccess) {
    return <Navigate to="/" replace />;
  }

  const isReadOnly = !canDoActions;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('collectionsCenter.title')}
        subtitle={t('collectionsCenter.subtitle')}
        tone="blue"
      />

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="space-y-5"
      >
        <div className="-mx-1 overflow-x-auto pb-1 print:hidden">
          <TabsList
            variant="line"
            className={cn(
              'mx-1 flex w-max min-w-full justify-start gap-1 rounded-xl border border-border bg-card p-1 shadow-sm',
            )}
          >
            <TabsTrigger
              value={TAB_WORK}
              className="gap-1.5 whitespace-nowrap rounded-lg px-3 data-active:bg-primary/10 data-active:text-primary"
            >
              <LayoutGrid className="h-4 w-4" />
              <span>{t('collectionsCenter.tabWork')}</span>
            </TabsTrigger>
            <TabsTrigger
              value={TAB_REPORT}
              className="gap-1.5 whitespace-nowrap rounded-lg px-3 data-active:bg-primary/10 data-active:text-primary"
            >
              <Wallet className="h-4 w-4" />
              <span>{t('collectionsCenter.tabReport')}</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value={TAB_WORK} className="mt-0">
          {activeTab === TAB_WORK ?
            <CollectionsCockpitView dataEnabled isReadOnly={isReadOnly} />
          : null}
        </TabsContent>
        <TabsContent value={TAB_REPORT} className="mt-0">
          {activeTab === TAB_REPORT ?
            <CollectionsReportView isReadOnly={isReadOnly} />
          : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}

import { useMemo } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ComponentType } from 'react';
import { Brain, FileSpreadsheet } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { can, type AccessKey } from '@/modules/shared/auth/access-matrix';
import { PageHeader } from '@/modules/shared/components/page';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/modules/shared/components/ui/tabs';
import { ReportsPage } from '@/pages/reports-page';
import { InsightsAiPage } from '@/pages/insights-ai-page';
import { cn } from '@/lib/utils';

/**
 * V19.23 — Operational + insights hub (split from the financial reports hub).
 *
 * Hosts invoice/cash operational reports and AI/BI insights as tabs.
 * `/reports` and `/insights/ai` remain registered for bookmarks.
 */

type TabDef = {
  id: string;
  labelKey: string;
  access: AccessKey;
  Component: ComponentType;
  Icon: ComponentType<{ className?: string }>;
};

const TABS: readonly TabDef[] = [
  {
    id: 'reports',
    labelKey: 'reports.hubTabReports',
    access: 'reports.view',
    Component: ReportsPage,
    Icon: FileSpreadsheet,
  },
  {
    id: 'ai',
    labelKey: 'reports.hubTabAi',
    access: 'insights.view',
    Component: InsightsAiPage,
    Icon: Brain,
  },
];

export function OperationalReportsHubPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const allowedTabs = useMemo(
    () => TABS.filter((tab) => can(user, tab.access)),
    [user],
  );

  if (allowedTabs.length === 0) {
    return <Navigate to="/" replace />;
  }

  const requestedTab = searchParams.get('tab');
  const activeTab = allowedTabs.some((tab) => tab.id === requestedTab)
    ? (requestedTab as string)
    : allowedTabs[0].id;

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

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('reports.operationalHubTitle')}
        subtitle={t('reports.operationalHubSubtitle')}
        tone="green"
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
            {allowedTabs.map((tab) => {
              const Icon = tab.Icon;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="gap-1.5 whitespace-nowrap rounded-lg px-3 data-active:bg-primary/10 data-active:text-primary"
                >
                  <Icon className="h-4 w-4" />
                  <span>{t(tab.labelKey)}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {allowedTabs.map((tab) => {
          const Component = tab.Component;
          return (
            <TabsContent key={tab.id} value={tab.id} className="mt-0">
              <Component />
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}

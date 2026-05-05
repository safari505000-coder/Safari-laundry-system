import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/modules/shared/auth/access-matrix';

export function ForbiddenPage() {
  const { user } = useAuth();
  const { t } = useTranslation();

  const showExpenseReports = user ? can(user, 'expenses.view') : false;
  const showSalesSummary = user ? can(user, 'reports.view') : false;

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm font-medium text-muted-foreground">403</p>
      <h1 className="text-2xl font-semibold">
        {t('errors.noAccessTitle')}
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {t('errors.noAccessBody')}
      </p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <Link
          to="/"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
        >
          {t('errors.backToDashboard')}
        </Link>
        {showExpenseReports ?
          <Link
            to="/expenses/reports"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-muted"
          >
            {t('nav.expenseReports')}
          </Link>
        : null}
        {showSalesSummary ?
          <Link
            to="/reports/sales-summary"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-muted"
          >
            {t('nav.salesSummaryReport')}
          </Link>
        : null}
      </div>
    </main>
  );
}

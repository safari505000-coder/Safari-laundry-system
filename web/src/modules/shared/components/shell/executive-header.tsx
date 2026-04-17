import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { BranchSwitcher } from '@/modules/shared/components/branch-switcher';
import { BrandLogo } from '@/modules/shared/components/brand-logo';
import { LanguageToggle } from '@/components/i18n/language-toggle';
import { Button } from '@/modules/shared/components/ui/button';
import { useAuth } from '@/contexts/auth-context';

export function ExecutiveHeader() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const isOwner = hasRole('OWNER');

  return (
    <header className="print:hidden sticky top-0 z-40 flex h-14 shrink-0 items-center gap-4 border-b border-border bg-card/90 px-4 shadow-sm backdrop-blur-sm sm:px-6 lg:px-8">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <BrandLogo className="me-2" compact />
        <span className="hidden truncate text-sm font-semibold text-primary sm:inline">
          Safari Omni
        </span>
      </div>
      <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
        {isOwner ? (
          <Button
            type="button"
            variant="outline"
            className="h-9 border-primary/25 bg-background text-primary hover:bg-primary/5"
            onClick={() => navigate('/admin/live-monitor')}
          >
            <Activity className="me-2 h-4 w-4" aria-hidden />
            نبض سفاري
          </Button>
        ) : null}
        <BranchSwitcher />
        <span className="hidden text-xs font-medium text-muted-foreground sm:inline">
          {t('language.switch')}
        </span>
        <LanguageToggle variant="outline" className="bg-background" />
      </div>
    </header>
  );
}

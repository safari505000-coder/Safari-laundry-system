import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { Activity, ArrowLeft, ArrowRight } from 'lucide-react';
import { BranchSwitcher } from '@/modules/shared/components/branch-switcher';
import { BrandLogo } from '@/modules/shared/components/brand-logo';
import { LanguageToggle } from '@/components/i18n/language-toggle';
import { ThemeToggle } from '@/modules/shared/theme/theme-toggle';
import { Button } from '@/modules/shared/components/ui/button';
import { useAuth } from '@/contexts/auth-context';
import { BRAND } from '@/lib/brand';

export function ExecutiveHeader() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { hasRole } = useAuth();
  const isOwner = hasRole('OWNER');
  const rtl = i18n.language?.startsWith('ar') ?? false;
  const systemName = rtl ? BRAND.systemAr : BRAND.systemEn;

  /*
   * V19.4 — Mobile-only "exit page" button. On pages other than the
   * index route we let the user back out one step; on the index route
   * the arrow is hidden to avoid a dead button. In RTL the arrow
   * naturally flips direction (ArrowRight instead of ArrowLeft).
   */
  const isIndex = pathname === '/';
  const BackIcon = rtl ? ArrowRight : ArrowLeft;
  const goBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  return (
    <header className="print:hidden sticky top-0 z-40 flex h-14 shrink-0 items-center gap-4 border-b border-border bg-card/90 px-4 shadow-sm backdrop-blur-sm sm:px-6 lg:px-8">
      {!isIndex ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={t('nav.back', 'رجوع')}
          className="h-9 w-9 shrink-0 md:hidden"
          onClick={goBack}
        >
          <BackIcon className="h-5 w-5" aria-hidden />
        </Button>
      ) : null}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <BrandLogo className="me-2" compact />
        <span className="hidden truncate text-sm font-semibold text-primary sm:inline">
          {systemName}
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
        <ThemeToggle variant="outline" className="bg-background" />
      </div>
    </header>
  );
}

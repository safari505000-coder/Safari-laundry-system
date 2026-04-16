import { useTranslation } from 'react-i18next';
import { BranchSwitcher } from '@/components/layout/branch-switcher';
import { LanguageToggle } from '@/components/i18n/language-toggle';

export function ExecutiveHeader() {
  const { t } = useTranslation();

  return (
    <header className="print:hidden sticky top-0 z-40 flex h-14 shrink-0 items-center gap-4 border-b border-border bg-card/90 px-4 shadow-sm backdrop-blur-sm sm:px-6 lg:px-8">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <img
          src="/logo.png"
          alt="Safari Omni"
          className="me-2 h-11 w-auto max-h-[45px] max-w-[180px] object-contain"
        />
        <span className="hidden truncate text-sm font-semibold text-primary sm:inline">
          Safari Omni
        </span>
      </div>
      <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
        <BranchSwitcher />
        <span className="hidden text-xs font-medium text-muted-foreground sm:inline">
          {t('language.switch')}
        </span>
        <LanguageToggle variant="outline" className="bg-background" />
      </div>
    </header>
  );
}

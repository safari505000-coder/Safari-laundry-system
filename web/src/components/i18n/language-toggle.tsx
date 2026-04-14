import { Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { type AppLocale, writeStoredLocale } from '@/i18n/constants';

type LanguageToggleProps = {
  variant?: 'ghost' | 'outline';
  /** e.g. login screen (dark) vs shell (light) */
  className?: string;
};

export function LanguageToggle({
  variant = 'ghost',
  className,
}: LanguageToggleProps) {
  const { t, i18n } = useTranslation();

  function setLang(lng: AppLocale) {
    writeStoredLocale(lng);
    void i18n.changeLanguage(lng);
  }

  const current = i18n.language.startsWith('ar') ? 'ar' : 'en';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({
            variant,
            size: 'icon',
            className: 'shrink-0 rounded-lg',
          }),
          className,
        )}
        aria-label={t('language.toggleAria')}
      >
        <Globe className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        <DropdownMenuItem
          onClick={() => setLang('en')}
          className={cn(current === 'en' && 'bg-accent')}
        >
          {t('language.english')}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setLang('ar')}
          className={cn(current === 'ar' && 'bg-accent')}
        >
          {t('language.arabic')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

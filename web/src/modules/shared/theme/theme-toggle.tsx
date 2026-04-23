import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '@/modules/shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/modules/shared/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useTheme, type ThemeMode } from './theme-provider';

/**
 * Stage-F Cosmetic — sun/moon toggle used in shell headers.
 *
 * Visual rules:
 *   - The trigger icon reflects the *resolved* theme (sun for light,
 *     moon for dark) so users see what's actually rendered rather
 *     than the `system` abstraction.
 *   - The dropdown shows all three options with a checkmark next to
 *     the user's current selection.
 *
 * Mirrors the layout of `LanguageToggle` so headers can slot either
 * control in interchangeably.
 */

type ThemeToggleProps = {
  variant?: 'ghost' | 'outline';
  className?: string;
};

type OptionDef = {
  id: ThemeMode;
  labelKey: string;
  Icon: typeof Sun;
};

const OPTIONS: readonly OptionDef[] = [
  { id: 'light', labelKey: 'theme.light', Icon: Sun },
  { id: 'dark', labelKey: 'theme.dark', Icon: Moon },
  { id: 'system', labelKey: 'theme.system', Icon: Monitor },
];

export function ThemeToggle({
  variant = 'ghost',
  className,
}: ThemeToggleProps) {
  const { t } = useTranslation();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const TriggerIcon = resolvedTheme === 'dark' ? Moon : Sun;

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
        aria-label={t('theme.toggleAria')}
      >
        <TriggerIcon className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[11rem]">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
            {t('theme.label')}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {OPTIONS.map(({ id, labelKey, Icon }) => {
            const active = theme === id;
            return (
              <DropdownMenuItem
                key={id}
                onClick={() => setTheme(id)}
                className={cn('gap-2', active && 'bg-accent/60')}
              >
                <Icon className="size-4" aria-hidden />
                <span className="flex-1">{t(labelKey)}</span>
                {active ? (
                  <Check className="size-4 text-primary" aria-hidden />
                ) : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

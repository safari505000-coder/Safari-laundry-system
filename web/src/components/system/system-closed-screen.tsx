import { useTranslation } from 'react-i18next';
import { LogOut, Moon } from 'lucide-react';
import { BrandLogo } from '@/modules/shared/components/brand-logo';
import { Button } from '@/modules/shared/components/ui/button';

type Props = {
  kuwaitTimeLabel: string;
  onSignOut: () => void;
};

export function SystemClosedScreen({ kuwaitTimeLabel, onSignOut }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-gradient-to-b from-[#0f172a] to-[#1e293b] px-4 text-center text-white">
      <BrandLogo tone="onDark" className="mb-6 max-h-16" />
      <div className="mb-4 rounded-full bg-white/10 p-4">
        <Moon className="h-10 w-10 text-amber-200" aria-hidden />
      </div>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        {t('systemClosed.title')}
      </h1>
      <p className="mt-2 max-w-md text-sm text-slate-300">
        {t('systemClosed.body')}
      </p>
      <p className="mt-4 text-xs text-slate-400">
        {t('systemClosed.kuwaitTime', { time: kuwaitTimeLabel })}
      </p>
      <Button
        type="button"
        variant="secondary"
        className="mt-8"
        onClick={onSignOut}
      >
        <LogOut className="me-2 h-4 w-4" />
        {t('nav.signOut')}
      </Button>
    </div>
  );
}


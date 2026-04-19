import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { BrandLogo } from '@/modules/shared/components/brand-logo';
import { LanguageToggle } from '@/components/i18n/language-toggle';
import { useAuth } from '@/contexts/auth-context';
import { ApiError } from '@/lib/api';
import { Button } from '@/modules/shared/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/modules/shared/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/modules/shared/components/ui/dialog';
import { Input } from '@/modules/shared/components/ui/input';
import { Label } from '@/modules/shared/components/ui/label';

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token, user, login } = useAuth();
  const loc = useLocation() as { state?: { from?: { pathname: string } } };
  const from = loc.state?.from?.pathname ?? '/';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  if (token && user) {
    const dest = user.safariRole === 'DRIVER' ? '/pos' : from;
    return <Navigate to={dest} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const me = await login(username, password);
      toast.success(t('login.signedIn'));
      navigate(me.safariRole === 'DRIVER' ? '/pos' : from, { replace: true });
    } catch (err) {
      let msg = t('login.signInError');
      if (err instanceof ApiError) {
        msg =
          err.errorCode === 'OUTSIDE_WORKING_HOURS' ?
            t('login.outsideWorkingHours')
          : err.message;
      }
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-slate-950 px-4">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -start-24 top-10 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl animate-pulse" />
        <div className="absolute end-0 top-1/3 h-80 w-80 rounded-full bg-indigo-500/20 blur-3xl animate-pulse" />
        <div className="absolute bottom-0 start-1/3 h-72 w-72 rounded-full bg-fuchsia-500/15 blur-3xl animate-pulse" />
      </div>
      <div className="absolute end-4 top-4 z-10 sm:end-6 sm:top-6">
        <LanguageToggle
          variant="outline"
          className="border-white/25 bg-white/10 text-white hover:bg-white/15"
        />
      </div>

      <div className="z-10 mb-8 text-white">
        <BrandLogo />
      </div>

      <Card className="z-10 w-full max-w-md border-white/25 bg-white/12 shadow-2xl shadow-black/30 backdrop-blur-xl">
        <CardHeader className="space-y-1">
          <CardTitle className="text-xl text-white">{t('login.cardTitle')}</CardTitle>
          <CardDescription className="text-zinc-200">{t('login.cardDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-zinc-100">{t('login.username')}</Label>
              <Input
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="border-white/40 bg-white/90"
                placeholder={t('login.usernamePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-zinc-100">{t('login.password')}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="border-white/40 bg-white/90"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                className="text-xs text-cyan-200 underline underline-offset-2"
                onClick={() => setForgotOpen(true)}
              >
                {t('login.forgotPassword')}
              </button>
            </div>
            <Button
              type="submit"
              size="lg"
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={loading}
            >
              {loading ? t('login.signingIn') : t('login.continue')}
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="z-10 mt-8 max-w-sm text-center text-xs text-zinc-300">
        {t('login.copyright')}
      </p>
      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('login.forgotModalTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t('login.forgotModalBody')}
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}


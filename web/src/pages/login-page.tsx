import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { LanguageToggle } from '@/components/i18n/language-toggle';
import { useAuth } from '@/contexts/auth-context';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioTower } from 'lucide-react';

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token, user, login } = useAuth();
  const loc = useLocation() as { state?: { from?: { pathname: string } } };
  const from = loc.state?.from?.pathname ?? '/';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

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
      const msg =
        err instanceof ApiError ? err.message : t('login.signInError');
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center bg-zinc-950 px-4">
      <div className="absolute end-4 top-4 z-10 sm:end-6 sm:top-6">
        <LanguageToggle
          variant="outline"
          className="border-white/25 bg-white/10 text-white hover:bg-white/15"
        />
      </div>

      <div className="mb-10 flex items-center gap-3 text-white">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/15 ring-1 ring-amber-500/40">
          <RadioTower className="h-7 w-7 text-amber-400" aria-hidden />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-zinc-500">
            {t('login.brand')}
          </p>
          <h1 className="text-xl font-semibold tracking-tight">
            {t('login.title')}
          </h1>
        </div>
      </div>

      <Card className="w-full max-w-md border-zinc-200 shadow-xl shadow-black/20">
        <CardHeader className="space-y-1">
          <CardTitle className="text-xl">{t('login.cardTitle')}</CardTitle>
          <CardDescription>{t('login.cardDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">{t('login.username')}</Label>
              <Input
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="bg-white"
                placeholder={t('login.usernamePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('login.password')}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-white"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-zinc-900 text-white hover:bg-zinc-800"
              disabled={loading}
            >
              {loading ? t('login.signingIn') : t('login.continue')}
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="mt-8 max-w-sm text-center text-xs text-zinc-500">
        {t('login.footer')}
      </p>
    </div>
  );
}

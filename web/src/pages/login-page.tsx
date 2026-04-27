import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { BrandLogo } from '@/modules/shared/components/brand-logo';
import { LanguageToggle } from '@/components/i18n/language-toggle';
import { useAuth } from '@/contexts/auth-context';
import { ApiError } from '@/lib/api';
import { Button } from '@/modules/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/modules/shared/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/modules/shared/components/ui/dialog';
import { Input } from '@/modules/shared/components/ui/input';
import { Label } from '@/modules/shared/components/ui/label';
import { Checkbox } from '@/modules/shared/components/ui/checkbox';
import { cn } from '@/lib/utils';

/** لوحة تسويق + نص على خلفية متدرّجة متحركة (متناسقة مع `LoginAtmosphere`). */
function LoginHeroPanel({
  badge,
  headline,
  body,
  className,
}: {
  badge: string;
  headline: string;
  body: string;
  className?: string;
}) {
  const { i18n } = useTranslation();
  const isRtl = i18n.dir() === 'rtl';
  return (
    <div
      className={cn(
        'flex flex-col items-stretch justify-center px-3 pb-8 pt-14 sm:px-5 md:px-6 lg:py-10',
        className,
      )}
    >
      <style>
        {`
          @keyframes login-aurora-a {
            0%, 100% { transform: translate(0%, 0%) scale(1); opacity: 0.35; }
            50% { transform: translate(8%, 6%) scale(1.12); opacity: 0.55; }
          }
          @keyframes login-aurora-b {
            0%, 100% { transform: translate(0%, 0%) scale(1.05); opacity: 0.3; }
            50% { transform: translate(-6%, 4%) scale(0.95); opacity: 0.5; }
          }
          @keyframes login-aurora-c {
            0%, 100% { transform: translate(-4%, 0) rotate(0deg); opacity: 0.25; }
            50% { transform: translate(5%, 2%) rotate(3deg); opacity: 0.4; }
          }
          @keyframes login-veil-drift {
            0% { background-position: 0% 50%; }
            100% { background-position: 100% 50%; }
          }
        `}
      </style>

      <div
        className="relative mx-auto w-full max-w-lg overflow-hidden rounded-2xl border border-cyan-500/15 shadow-[0_0_0_1px_rgba(34,211,238,0.08),0_20px_50px_-20px_rgba(0,0,0,0.6)]"
        style={{ isolation: 'isolate' }}
      >
        {/* خلفية متحركة: طبقات سديمية + حافة متدرّجة بطيئة */}
        <div
          className="pointer-events-none absolute inset-0 bg-slate-950/85"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -start-1/4 -top-1/4 h-[min(100%,24rem)] w-[min(120%,32rem)] rounded-full bg-cyan-500/25 blur-3xl motion-safe:[animation:login-aurora-a_22s_ease-in-out_infinite] motion-reduce:opacity-30"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -end-1/3 bottom-0 h-[min(100%,20rem)] w-[min(110%,28rem)] rounded-full bg-violet-500/20 blur-3xl motion-safe:[animation:login-aurora-b_26s_ease-in-out_infinite] motion-reduce:opacity-30"
          style={{ animationDelay: '-2s' }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute start-1/3 top-1/2 h-[14rem] w-[18rem] -translate-y-1/2 rounded-full bg-amber-500/10 blur-3xl motion-safe:[animation:login-aurora-c_19s_ease-in-out_infinite] motion-reduce:opacity-20"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background: `
              linear-gradient(120deg, transparent 0%, rgba(6, 182, 212, 0.08) 40%, rgba(139, 92, 246, 0.06) 60%, transparent 100%)
            `,
            backgroundSize: '200% 200%',
            animation: 'login-veil-drift 32s ease-in-out infinite alternate',
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(34, 211, 238, 0.15) 1px, transparent 1px),
              linear-gradient(90deg, rgba(34, 211, 238, 0.15) 1px, transparent 1px)
            `,
            backgroundSize: '20px 20px',
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/5"
          aria-hidden
        />

        <div
          className={cn(
            'relative z-10 px-4 py-6 sm:px-6 sm:py-8 md:px-7 md:py-9',
            isRtl ? 'text-right' : 'text-left',
          )}
        >
          <p className="mb-2 font-mono text-[0.65rem] uppercase tracking-[0.22em] text-cyan-400/90 sm:text-xs">
            {badge}
          </p>
          <h2
            className="text-balance text-lg font-semibold leading-snug text-cyan-50/95 sm:text-xl md:text-2xl"
            style={{ textShadow: '0 0 24px rgba(6, 182, 212, 0.2)' }}
          >
            {headline}
          </h2>
          <p className="mt-4 text-pretty text-sm leading-7 text-zinc-300/95 sm:leading-8">
            {body}
          </p>
        </div>
      </div>
    </div>
  );
}

function LoginAtmosphere() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-[#030712]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_70%_at_50%_40%,rgba(6,182,212,0.08),transparent_55%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_15%_50%,rgba(139,92,246,0.1),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_85%_30%,rgba(245,158,11,0.06),transparent_50%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,rgba(2,6,23,0.4)_100%)]" />
      <div
        className="absolute top-[40%] h-[min(180vmin,42rem)] w-[min(180vmin,42rem)] -translate-x-1/2 -translate-y-1/2 motion-safe:animate-[spin_80s_linear_infinite] motion-reduce:animate-none sm:top-[38%] left-[50%] sm:left-[40%] lg:top-1/2 lg:left-[30%] motion-reduce:opacity-60"
        style={{
          background:
            'conic-gradient(from 0deg at 50% 50%, transparent 0deg, rgba(6,182,212,0.1) 40deg, transparent 100deg, rgba(139,92,246,0.08) 160deg, transparent 220deg, rgba(245,158,11,0.07) 300deg, transparent 360deg)',
          mixBlendMode: 'screen',
        }}
      />
      <div
        className="absolute top-[40%] h-[min(150vmin,36rem)] w-[min(150vmin,36rem)] -translate-x-1/2 -translate-y-1/2 sm:top-[38%] left-[50%] sm:left-[40%] lg:top-1/2 lg:left-[30%] motion-reduce:opacity-35"
        style={{
          background:
            'conic-gradient(from 120deg at 50% 50%, transparent, rgba(34,211,238,0.07), transparent, rgba(167,139,250,0.07), transparent)',
          mixBlendMode: 'plus-lighter',
          animation: 'spin 100s linear infinite reverse',
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_100%_80%_at_50%_100%,rgba(0,0,0,0.5),transparent_55%)]" />
    </div>
  );
}

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token, user, login, rememberedUsername } = useAuth();
  const loc = useLocation() as { state?: { from?: { pathname: string } } };
  const from = loc.state?.from?.pathname ?? '/';

  const [username, setUsername] = useState(rememberedUsername);
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState<boolean>(
    rememberedUsername.length > 0,
  );
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
      const me = await login(username, password, rememberMe);
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
    <div className="relative min-h-svh text-zinc-100">
      <LoginAtmosphere />
      <div className="absolute end-0 top-0 z-20 flex w-full justify-end p-3 sm:p-4">
        <LanguageToggle
          variant="outline"
          className="border-white/15 bg-slate-950/40 text-zinc-100 backdrop-blur-md hover:bg-slate-900/50"
        />
      </div>
      <div className="relative z-10 mx-auto grid min-h-svh max-w-6xl grid-cols-1 gap-0 px-0 lg:grid-cols-[1fr_1.05fr]">
        <LoginHeroPanel
          badge={t('login.chipCaption')}
          headline={t('login.heroHeadline')}
          body={t('login.heroBody')}
          className="min-h-0 justify-center border-b border-white/[0.06] lg:min-h-svh lg:border-b-0 lg:border-e lg:border-e-white/[0.06] lg:pt-8"
        />
        <div className="flex min-h-0 flex-col items-center justify-center gap-6 px-4 py-10 sm:px-6 lg:min-h-svh lg:py-12 lg:pe-8">
          <div className="w-full max-w-md text-center">
            <BrandLogo tone="onDark" />
          </div>
          <Card className="w-full max-w-md border border-white/10 bg-slate-950/35 shadow-xl shadow-black/20 backdrop-blur-xl">
            <CardHeader className="space-y-1">
              <CardTitle className="text-xl text-white">
                {t('login.cardTitle')}
              </CardTitle>
              <CardDescription className="text-zinc-400">
                {t('login.cardDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username" className="text-zinc-200">
                    {t('login.username')}
                  </Label>
                  <Input
                    id="username"
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    className="border-white/10 bg-slate-950/50 text-zinc-100 placeholder:text-zinc-500"
                    placeholder={t('login.usernamePlaceholder')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-zinc-200">
                    {t('login.password')}
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="border-white/10 bg-slate-950/50 text-zinc-100"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <label className="inline-flex cursor-pointer select-none items-center gap-2">
                    <Checkbox
                      checked={rememberMe}
                      onCheckedChange={(v) => setRememberMe(v === true)}
                      className="border-white/30 data-[state=checked]:bg-cyan-600 data-[state=checked]:text-white"
                      aria-label={t('login.rememberMe')}
                    />
                    <span
                      className="text-xs text-zinc-200"
                      title={t('login.rememberMeHint')}
                    >
                      {t('login.rememberMe')}
                    </span>
                  </label>
                  <button
                    type="button"
                    className="text-xs text-cyan-300/90 underline decoration-cyan-500/30 underline-offset-2 hover:text-cyan-200"
                    onClick={() => setForgotOpen(true)}
                  >
                    {t('login.forgotPassword')}
                  </button>
                </div>
                <Button
                  type="submit"
                  size="lg"
                  className="w-full bg-gradient-to-r from-cyan-600 to-cyan-700 text-white shadow-lg shadow-cyan-950/30 hover:from-cyan-500 hover:to-cyan-600"
                  disabled={loading}
                >
                  {loading ? t('login.signingIn') : t('login.continue')}
                </Button>
              </form>
            </CardContent>
          </Card>
          <div className="w-full max-w-md space-y-1.5 text-center">
            <p className="text-balance text-xs text-zinc-500">
              {t('login.copyright')}
            </p>
            <p className="text-balance text-[10px] text-zinc-600">
              {t('login.footer')}
            </p>
          </div>
        </div>
      </div>
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

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, PhoneIncoming } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { ApiError, getResolveIncomingPhone } from '@/lib/api';

/**
 * CTI / PBX handoff — opened from the dialer as
 * `/call-incoming?phone=…` (staff must be logged in).
 */
export function CallIncomingPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const rawPhone = useMemo(() => {
    const p =
      searchParams.get('phone') ??
      searchParams.get('caller') ??
      searchParams.get('num') ??
      '';
    return p.trim();
  }, [searchParams]);

  useEffect(() => {
    if (!token) {
      return;
    }
    if (!rawPhone) {
      setError(t('callIncoming.missingPhone'));
      return;
    }
    let cancelled = false;
    setError(null);
    void (async () => {
      try {
        const r = await getResolveIncomingPhone(token, rawPhone);
        if (cancelled) return;
        const qs = new URLSearchParams();
        if (r.ambiguous && r.searchHint) {
          qs.set('q', r.searchHint);
          navigate(`/customers?${qs.toString()}`, { replace: true });
          return;
        }
        if (r.customer) {
          qs.set('q', r.customer.phone || rawPhone);
          qs.set('focus', r.customer.id);
          navigate(`/customers?${qs.toString()}`, { replace: true });
          return;
        }
        qs.set('newPhone', rawPhone);
        navigate(`/customers?${qs.toString()}`, { replace: true });
      } catch (e) {
        if (cancelled) return;
        setError(
          e instanceof ApiError
            ? e.message
            : t('callIncoming.lookupFailed'),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, rawPhone, navigate, t]);

  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4 px-4">
      <PhoneIncoming className="h-10 w-10 text-muted-foreground" aria-hidden />
      {!error ? (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
          <p className="text-sm text-muted-foreground text-center max-w-sm">
            {t('callIncoming.resolving')}
          </p>
        </>
      ) : (
        <p className="text-sm text-destructive text-center max-w-md">{error}</p>
      )}
    </div>
  );
}

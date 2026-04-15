import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  type BranchOperationsLiveResponse,
  type BranchRow,
  apiJson,
  ApiError,
} from '@/lib/api';
import { BRANCHES_LIST_REFRESH_EVENT } from '@/lib/branch-list-refresh';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const ALL_VALUE = '__ALL__';
const LIVE_POLL_MS = 12_000;

export function BranchSwitcher() {
  const { t } = useTranslation();
  const { token, hasRole, ownerBranchId, setOwnerBranchId } = useAuth();
  const [branches, setBranches] = useState<BranchRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [liveByBranch, setLiveByBranch] = useState<Record<string, boolean>>(
    {},
  );

  const isOwner = hasRole('OWNER');

  const anyBranchLive = useMemo(
    () => Object.values(liveByBranch).some(Boolean),
    [liveByBranch],
  );

  const activeBranches = useMemo(
    () => (branches ?? []).filter((b) => b.isActive),
    [branches],
  );

  const fetchBranches = useCallback(() => {
    if (!isOwner || !token) return;
    setLoading(true);
    void apiJson<BranchRow[]>('/api/branches', { token })
      .then((rows) => {
        setBranches(Array.isArray(rows) ? rows : []);
      })
      .catch((e) => {
        if (e instanceof ApiError) toast.error(e.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOwner, token]);

  useEffect(() => {
    if (!isOwner || !token) {
      setBranches(null);
      setLiveByBranch({});
      return;
    }
    fetchBranches();
  }, [isOwner, token, fetchBranches]);

  useEffect(() => {
    if (!isOwner) return;
    const handler = () => {
      fetchBranches();
    };
    window.addEventListener(BRANCHES_LIST_REFRESH_EVENT, handler);
    return () =>
      window.removeEventListener(BRANCHES_LIST_REFRESH_EVENT, handler);
  }, [isOwner, fetchBranches]);

  useEffect(() => {
    if (!isOwner || !token) return;
    let cancelled = false;
    const load = () => {
      void apiJson<BranchOperationsLiveResponse>('/api/branches/operations-live', {
        token,
      })
        .then((res) => {
          if (cancelled || !res?.branches) return;
          const next: Record<string, boolean> = {};
          for (const b of res.branches) {
            next[b.branchId] = b.isLive;
          }
          setLiveByBranch(next);
        })
        .catch(() => {});
    };
    load();
    const id = window.setInterval(load, LIVE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [isOwner, token]);

  if (!isOwner) return null;

  const value = ownerBranchId ?? ALL_VALUE;

  return (
    <div className="flex min-w-0 max-w-[min(100%,15rem)] flex-col gap-0.5 sm:max-w-[16rem]">
      {anyBranchLive ?
        <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
          {t('branchSwitcher.liveHint')}
        </span>
      : null}
      <div className="flex min-w-0 items-center gap-2">
      <Building2
        className="h-4 w-4 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <Select
        value={value}
        disabled={loading && !activeBranches.length}
        onValueChange={(v) => {
          setOwnerBranchId(v === ALL_VALUE ? null : v);
        }}
      >
        <SelectTrigger
          className="h-9 min-h-9 w-full min-w-0 border-border bg-background text-start text-xs sm:text-sm"
          aria-label={t('branchSwitcher.label')}
        >
          {loading && !branches?.length ?
            <span className="flex items-center gap-1 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            </span>
          : <SelectValue placeholder={t('branchSwitcher.placeholder')} />}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>{t('branchSwitcher.all')}</SelectItem>
          {activeBranches.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              <span className="flex items-center gap-2">
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center"
                  title={
                    liveByBranch[b.id] ?
                      t('branchSwitcher.branchLiveTitle')
                    : t('branchSwitcher.branchIdleTitle')
                  }
                >
                  {liveByBranch[b.id] ?
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                  : <span className="h-2 w-2 rounded-full bg-muted-foreground/25" />}
                </span>
                <span className="min-w-0 truncate">{b.name}</span>
                {liveByBranch[b.id] ?
                  <span className="ms-1 rounded bg-emerald-500/15 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                    {t('branchSwitcher.liveBadge')}
                  </span>
                : null}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      </div>
    </div>
  );
}

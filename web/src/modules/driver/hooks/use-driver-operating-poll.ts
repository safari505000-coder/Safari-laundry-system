import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { apiJson, getOperatingStatus, type OperatingStatusPayload } from '@/lib/api';

/**
 * Kuwait operating window + financial-day rollover for field POS.
 * Call from Driver POS only; keeps shift aligned when the financial date changes.
 */
export function useDriverOperatingPoll(token: string | null | undefined) {
  const [operating, setOperating] = useState<OperatingStatusPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getOperatingStatus().then((r) => {
      if (!cancelled) setOperating(r);
    });
    const id = window.setInterval(() => {
      void getOperatingStatus().then((r) => {
        if (cancelled) return;
        setOperating((prev) => {
          if (token && prev && prev.financialDateIso !== r.financialDateIso) {
            toast.message(`New financial day: ${r.financialDateLabel}`);
            void apiJson('/api/finance/driver/ensure-shift', {
              method: 'POST',
              token,
            }).catch(() => {});
          }
          return r;
        });
      });
    }, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [token]);

  return { operating, setOperating };
}

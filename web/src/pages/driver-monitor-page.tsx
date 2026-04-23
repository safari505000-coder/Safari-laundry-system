import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/modules/shared/auth/access-matrix';
import { ApiError, apiJson, type DriverMonitoringResponse } from '@/lib/api';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/modules/shared/components/ui/card';
import { Badge } from '@/modules/shared/components/ui/badge';
import { Button } from '@/modules/shared/components/ui/button';
import { Input } from '@/modules/shared/components/ui/input';
import { Label } from '@/modules/shared/components/ui/label';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const KUWAIT_CENTER: [number, number] = [29.3759, 47.9774];

/**
 * V19.14 — Driver tracking screen.
 *
 * Previously locked to OWNER only (Phase 1.1). Re-opened for OWNER +
 * GENERAL_MANAGER + CALL_CENTER + CALL_CENTER_SUPERVISOR so the map
 * shell is visible on their sidebars again.
 *
 * API access split:
 *   • OWNER              → full live feed via `/api/finance/driver-monitoring`
 *                          (live markers + inline editor for vehicle label
 *                          and last-known location test hook).
 *   • GM / CC / CC_SUP   → UI shell only. The backend still enforces
 *                          `@Roles(OWNER)` on the endpoint, so loading
 *                          returns 403. We catch that quietly and render
 *                          a "coming soon" placeholder until a dedicated
 *                          read-only endpoint is wired for these roles.
 *
 * Keeping the backend guard untouched is deliberate: the Owner's Pulse
 * radar and the future CC dispatch feed are different products with
 * different rate-limits, field filtering, and retention rules.
 */
export function DriverMonitorPage() {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const canUse = can(user, 'driverMonitor.view');
  const isOwner = user?.safariRole === 'OWNER';

  const [data, setData] = useState<DriverMonitoringResponse | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editor, setEditor] = useState<
    Record<string, { vehicleLabel: string; lastKnownLocation: string }>
  >({});
  // 403 = backend endpoint is OWNER-only; non-OWNER roles expect this
  // until the dedicated feed is wired. Anything else is a real error.
  const [feedLocked, setFeedLocked] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);

  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiJson<DriverMonitoringResponse>(
        '/api/finance/driver-monitoring',
        { token },
      );
      setData(res);
      setFeedLocked(false);
      setFeedError(null);
      const next: Record<
        string,
        { vehicleLabel: string; lastKnownLocation: string }
      > = {};
      for (const d of res.drivers) {
        next[d.driverId] = {
          vehicleLabel: d.vehicleLabel ?? '',
          lastKnownLocation: d.lastKnownLocation
            ? `${d.lastKnownLocation.lat},${d.lastKnownLocation.lng}`
            : '',
        };
      }
      setEditor(next);
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.status === 403 || err.status === 401)
      ) {
        // Expected for GM / CC / CC_SUP — the backend endpoint is still
        // OWNER-gated. Swallow silently so the placeholder renders.
        setFeedLocked(true);
        setFeedError(null);
        setData(null);
        return;
      }
      setFeedError(err instanceof Error ? err.message : String(err));
      setData(null);
    }
  }, [token]);

  useEffect(() => {
    if (!token || !canUse) return;
    void load();
  }, [token, canUse, load]);

  const drivers = useMemo(() => data?.drivers ?? [], [data]);

  const mapCenter = useMemo<[number, number]>(() => {
    const first = drivers.find((d) => d.markerLocation)?.markerLocation;
    return first ? [first.lat, first.lng] : KUWAIT_CENTER;
  }, [drivers]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (!leafletMapRef.current) {
      leafletMapRef.current = L.map(mapRef.current).setView(mapCenter, 11);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(leafletMapRef.current);
    }
    const map = leafletMapRef.current;
    map.eachLayer((layer: L.Layer) => {
      if ((layer as L.TileLayer).getAttribution) return;
      map.removeLayer(layer);
    });
    map.setView(mapCenter, 11);
    for (const d of drivers) {
      if (!d.markerLocation) continue;
      L.marker([d.markerLocation.lat, d.markerLocation.lng])
        .bindPopup(
          `<div><strong>${d.fullName}</strong><br/>@${d.username}<br/>${d.vehicleLabel}<br/>${
            d.source === 'LIVE_GPS'
              ? 'Live GPS'
              : `Branch: ${d.branch?.name ?? '—'}`
          }</div>`,
        )
        .addTo(map);
    }
  }, [drivers, mapCenter]);

  if (!canUse) return <Navigate to="/" replace />;

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <Card className="h-[70vh] overflow-hidden">
        <CardHeader>
          <CardTitle>{t('driverMonitor.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 overflow-auto">
          {feedLocked ? (
            <div className="rounded-lg border border-dashed p-4 text-sm">
              <p className="font-medium">{t('driverMonitor.pendingTitle')}</p>
              <p className="mt-2 text-muted-foreground">
                {t('driverMonitor.pendingDescription')}
              </p>
            </div>
          ) : null}
          {feedError ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {feedError}
            </div>
          ) : null}

          {drivers.map((d) => (
            <div key={d.driverId} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{d.fullName}</p>
                <Badge variant="secondary">{d.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                @{d.username} • {d.vehicleLabel}
              </p>
              <p className="text-xs text-muted-foreground">
                {d.source === 'LIVE_GPS'
                  ? 'Live GPS'
                  : `Branch fallback: ${d.branch?.name ?? '—'}`}
              </p>
              {isOwner ? (
                <div className="mt-3 space-y-2 rounded-md border p-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Vehicle Label</Label>
                    <Input
                      value={editor[d.driverId]?.vehicleLabel ?? ''}
                      onChange={(e) =>
                        setEditor((prev) => ({
                          ...prev,
                          [d.driverId]: {
                            ...(prev[d.driverId] ?? {
                              vehicleLabel: '',
                              lastKnownLocation: '',
                            }),
                            vehicleLabel: e.target.value,
                          },
                        }))
                      }
                      className="h-8"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      Last Known Location (lat,lng)
                    </Label>
                    <Input
                      value={editor[d.driverId]?.lastKnownLocation ?? ''}
                      onChange={(e) =>
                        setEditor((prev) => ({
                          ...prev,
                          [d.driverId]: {
                            ...(prev[d.driverId] ?? {
                              vehicleLabel: '',
                              lastKnownLocation: '',
                            }),
                            lastKnownLocation: e.target.value,
                          },
                        }))
                      }
                      className="h-8"
                    />
                  </div>
                  <Button
                    size="sm"
                    disabled={savingId === d.driverId}
                    onClick={() => {
                      if (!token) return;
                      setSavingId(d.driverId);
                      void apiJson(
                        `/api/finance/driver-monitoring/${d.driverId}`,
                        {
                          method: 'PATCH',
                          token,
                          body: JSON.stringify({
                            vehicleLabel:
                              editor[d.driverId]?.vehicleLabel ?? '',
                            lastKnownLocation:
                              editor[d.driverId]?.lastKnownLocation ?? '',
                          }),
                        },
                      )
                        .then(() => load())
                        .finally(() => setSavingId(null));
                    }}
                  >
                    Save test values
                  </Button>
                </div>
              ) : null}
            </div>
          ))}

          {!feedLocked && !feedError && drivers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('driverMonitor.emptyOnShift')}
            </p>
          ) : null}
        </CardContent>
      </Card>
      <Card className="h-[70vh] overflow-hidden">
        <CardContent className="h-full p-0">
          <div ref={mapRef} className="h-full w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

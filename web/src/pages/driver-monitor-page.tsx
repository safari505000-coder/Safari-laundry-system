import { useEffect, useMemo, useState } from 'react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { apiJson, type DriverMonitoringResponse } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/shared/components/ui/card';
import { Badge } from '@/modules/shared/components/ui/badge';
import { Button } from '@/modules/shared/components/ui/button';
import { Input } from '@/modules/shared/components/ui/input';
import { Label } from '@/modules/shared/components/ui/label';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const KUWAIT_CENTER: [number, number] = [29.3759, 47.9774];

export function DriverMonitorPage() {
  const { t } = useTranslation();
  const { token, hasRole } = useAuth();
  const [data, setData] = useState<DriverMonitoringResponse | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Record<string, { vehicleLabel: string; lastKnownLocation: string }>>({});
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const canUse = hasRole('CALL_CENTER', 'OWNER') ?? false;

  const load = () =>
    apiJson<DriverMonitoringResponse>('/api/finance/driver-monitoring', {
      token: token ?? undefined,
    }).then((res) => {
      setData(res);
      const next: Record<string, { vehicleLabel: string; lastKnownLocation: string }> = {};
      for (const d of res.drivers) {
        next[d.driverId] = {
          vehicleLabel: d.vehicleLabel ?? '',
          lastKnownLocation:
            d.lastKnownLocation ? `${d.lastKnownLocation.lat},${d.lastKnownLocation.lng}` : '',
        };
      }
      setEditor(next);
    });

  useEffect(() => {
    if (!token || !canUse) return;
    void load();
  }, [token, canUse]);

  if (!canUse) return <Navigate to="/" replace />;

  const drivers = data?.drivers ?? [];
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
              : `Branch: ${d.branch?.name ?? 'â€”'}`
          }</div>`,
        )
        .addTo(map);
    }
  }, [drivers, mapCenter]);

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <Card className="h-[70vh] overflow-hidden">
        <CardHeader>
          <CardTitle>{t('driverMonitor.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 overflow-auto">
          {drivers.map((d) => (
            <div key={d.driverId} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{d.fullName}</p>
                <Badge variant="secondary">{d.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                @{d.username} â€¢ {d.vehicleLabel}
              </p>
              <p className="text-xs text-muted-foreground">
                {d.source === 'LIVE_GPS'
                  ? 'Live GPS'
                  : `Branch fallback: ${d.branch?.name ?? 'â€”'}`}
              </p>
              {hasRole('OWNER') ? (
                <div className="mt-3 space-y-2 rounded-md border p-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Vehicle Label</Label>
                    <Input
                      value={editor[d.driverId]?.vehicleLabel ?? ''}
                      onChange={(e) =>
                        setEditor((prev) => ({
                          ...prev,
                          [d.driverId]: {
                            ...(prev[d.driverId] ?? { vehicleLabel: '', lastKnownLocation: '' }),
                            vehicleLabel: e.target.value,
                          },
                        }))
                      }
                      className="h-8"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Last Known Location (lat,lng)</Label>
                    <Input
                      value={editor[d.driverId]?.lastKnownLocation ?? ''}
                      onChange={(e) =>
                        setEditor((prev) => ({
                          ...prev,
                          [d.driverId]: {
                            ...(prev[d.driverId] ?? { vehicleLabel: '', lastKnownLocation: '' }),
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
                      void apiJson(`/api/finance/driver-monitoring/${d.driverId}`, {
                        method: 'PATCH',
                        token,
                        body: JSON.stringify({
                          vehicleLabel: editor[d.driverId]?.vehicleLabel ?? '',
                          lastKnownLocation: editor[d.driverId]?.lastKnownLocation ?? '',
                        }),
                      })
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
          {drivers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active drivers (ON_SHIFT).</p>
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


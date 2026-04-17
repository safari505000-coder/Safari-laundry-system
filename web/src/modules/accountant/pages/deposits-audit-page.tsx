import { useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { RequireRoles } from '@/modules/shared/components/require-roles';
import { useDepositsDataBridge } from '@/modules/accountant/hooks/use-deposits-data-bridge';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/shared/components/ui/card';
import { Button } from '@/modules/shared/components/ui/button';
import { Input } from '@/modules/shared/components/ui/input';
import { Label } from '@/modules/shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/modules/shared/components/ui/select';

function DepositsAuditContent() {
  const { token } = useAuth();
  const bridge = useDepositsDataBridge(token, true);

  const totals = useMemo(() => {
    const amount = bridge.rows.reduce((acc, r) => acc + Number.parseFloat(r.amount || '0'), 0);
    return Number.isFinite(amount) ? amount.toFixed(4) : '0.0000';
  }, [bridge.rows]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Bank & K-Net Audit</h1>
        <p className="text-sm text-muted-foreground">
          Data Bridge powered audit queue for accountant/owner.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label>Status</Label>
            <Select
              value={bridge.status}
              onValueChange={(v) =>
                bridge.setStatus(v as typeof bridge.status)
              }
            >
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">ALL</SelectItem>
                <SelectItem value="PENDING">PENDING</SelectItem>
                <SelectItem value="APPROVED">APPROVED</SelectItem>
                <SelectItem value="REJECTED">REJECTED</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Driver name</Label>
            <Input
              value={bridge.driverName}
              onChange={(e) => bridge.setDriverName(e.target.value)}
              placeholder="Search by driver name"
            />
          </div>
          <div className="space-y-1">
            <Label>Total (filtered)</Label>
            <Input value={`${totals} KWD`} readOnly />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Queue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {bridge.error ? (
            <p className="text-sm text-destructive">{bridge.error}</p>
          ) : null}
          {bridge.loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : null}
          {bridge.rows.map((r) => (
            <div key={r.id} className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{r.driverName}</p>
                <p className="text-sm">{r.amount} KWD</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {r.type} · {r.status} · {new Date(r.createdAt).toLocaleString()}
              </p>
              {r.status === 'PENDING' ? (
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={() => void bridge.audit(r.id, 'APPROVED')}>
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => void bridge.audit(r.id, 'REJECTED')}
                  >
                    Reject
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export function DepositsAuditPage() {
  return (
    <RequireRoles roles={['ACCOUNTANT']}>
      <DepositsAuditContent />
    </RequireRoles>
  );
}

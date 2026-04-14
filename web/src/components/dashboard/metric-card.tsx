import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type MetricCardProps = {
  title: string;
  subtitle?: string;
  value: ReactNode;
  icon?: ReactNode;
  emphasis?: boolean;
  footer?: ReactNode;
};

export function MetricCard({
  title,
  subtitle,
  value,
  icon,
  emphasis,
  footer,
}: MetricCardProps) {
  return (
    <Card
      className={cn(
        'rounded-[20px] border-border/80 bg-card shadow-sm shadow-black/[0.04] transition-shadow hover:shadow-md',
        emphasis &&
          'border-primary/20 ring-1 ring-primary/15 bg-gradient-to-br from-card to-primary/[0.06]',
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
        <div className="min-w-0 flex-1 text-start">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {title}
          </p>
          {subtitle ? (
            <p className="mt-1 text-xs text-muted-foreground/90">{subtitle}</p>
          ) : null}
        </div>
        {icon ? (
          <div className="rounded-xl bg-primary/10 p-2 text-primary [&_svg]:h-4 [&_svg]:w-4">
            {icon}
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
          {value}
        </div>
        {footer ? (
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            {footer}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

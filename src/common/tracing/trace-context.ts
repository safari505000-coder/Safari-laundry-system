import { context, trace, TraceFlags } from '@opentelemetry/api';

export function currentTraceId(): string | undefined {
  const span = trace.getActiveSpan();
  const traceId = span?.spanContext().traceId;
  return traceId && traceId !== '0'.repeat(32) ? traceId : undefined;
}

export async function runWithJobTraceAsync<T>(
  traceIdHex: string | undefined,
  spanName: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!traceIdHex || traceIdHex.length !== 32 || /^0{32}$/i.test(traceIdHex)) {
    return fn();
  }
  const tracer = trace.getTracer('safari-erp');
  const remote = {
    traceId: traceIdHex,
    spanId: '0000000000000001',
    traceFlags: TraceFlags.SAMPLED,
    isRemote: true as const,
  };
  const parentCtx = trace.setSpanContext(context.active(), remote);
  return context.with(parentCtx, () =>
    tracer.startActiveSpan(spanName, async (span) => {
      span.setAttribute('messaging.trace_id_hex', traceIdHex);
      try {
        return await fn();
      } finally {
        span.end();
      }
    }),
  );
}

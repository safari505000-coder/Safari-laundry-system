import { trace } from '@opentelemetry/api';

export async function withPaymentFinalizeSpan<T>(
  attrs: { orderId?: string; source?: string },
  fn: () => Promise<T>,
): Promise<T> {
  const tracer = trace.getTracer('safari-erp');
  return tracer.startActiveSpan('payments.finalize', async (span) => {
    if (attrs.orderId) {
      span.setAttribute('order.id', attrs.orderId);
    }
    if (attrs.source) {
      span.setAttribute('payments.source', attrs.source);
    }
    try {
      return await fn();
    } catch (err) {
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}

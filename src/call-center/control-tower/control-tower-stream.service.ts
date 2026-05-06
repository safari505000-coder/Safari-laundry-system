import { Injectable, type MessageEvent } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Observable, Subject, interval, merge } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  DISPATCH_ACKNOWLEDGED_EVENT,
  DISPATCH_COMPLETED_EVENT,
  DISPATCH_CREATED_EVENT,
  ORDER_CREATED_EVENT,
} from '../../dispatch/dispatch.events';

const HEARTBEAT_MS = 12_000;

/**
 * SSE feed for Control Tower — pushes refresh hints + periodic heartbeat.
 *
 * Clients: `addEventListener('control-tower:update')`, `addEventListener('heartbeat')`.
 * Browser JWT: `?access_token=` (same pattern as driver dispatch SSE).
 */
@Injectable()
export class ControlTowerStreamService {
  private readonly pushes = new Subject<MessageEvent>();

  private emit(kind: string, payload: Record<string, unknown>): void {
    this.pushes.next({
      type: 'control-tower:update',
      data: JSON.stringify({
        kind,
        ...payload,
        at: new Date().toISOString(),
      }),
    });
  }

  @OnEvent(ORDER_CREATED_EVENT, { async: true })
  handleOrderCreated(payload: { orderId?: string }): void {
    this.emit('order:created', { orderId: payload.orderId ?? null });
  }

  @OnEvent(DISPATCH_CREATED_EVENT, { async: true })
  handleDispatchCreated(payload: { id?: string }): void {
    this.emit('dispatch:created', {
      dispatchId: typeof payload?.id === 'string' ? payload.id : null,
    });
  }

  @OnEvent(DISPATCH_ACKNOWLEDGED_EVENT, { async: true })
  handleDispatchAcknowledged(payload: { dispatchId?: string }): void {
    this.emit('dispatch:acknowledged', {
      dispatchId: payload.dispatchId ?? null,
    });
  }

  @OnEvent(DISPATCH_COMPLETED_EVENT, { async: true })
  handleDispatchCompleted(payload: { dispatchId?: string }): void {
    this.emit('dispatch:completed', {
      dispatchId: payload.dispatchId ?? null,
    });
  }

  subscribeFeed(): Observable<MessageEvent> {
    const heartbeats = interval(HEARTBEAT_MS).pipe(
      map(
        (): MessageEvent => ({
          type: 'heartbeat',
          data: JSON.stringify({ ok: true, ts: new Date().toISOString() }),
        }),
      ),
    );
    return merge(this.pushes.asObservable(), heartbeats);
  }
}

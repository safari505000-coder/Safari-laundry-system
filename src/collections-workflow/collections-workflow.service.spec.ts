import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  CollectionsWorkflowService,
  RESOLVED_RETENTION_MS,
} from './collections-workflow.service';
import type { WorkflowKind } from './collections-workflow.types';

const ACTOR = { actorId: 'u1', actorName: 'Agent One' };

const createCallback = (svc: CollectionsWorkflowService, overrides: Record<string, unknown> = {}) =>
  svc.create({
    kind: 'CALLBACK',
    customerId: 'cust-1',
    customerNameSnapshot: 'Test Customer',
    scheduledAt: '2026-05-10T09:00:00.000Z',
    branchId: 'br-1',
    ...ACTOR,
    ...overrides,
  });

const createPromise = (svc: CollectionsWorkflowService, overrides: Record<string, unknown> = {}) =>
  svc.create({
    kind: 'PROMISE',
    customerId: 'cust-1',
    amountKdSnapshot: '12.500',
    scheduledAt: '2026-05-12T00:00:00.000Z',
    branchId: 'br-1',
    ...ACTOR,
    ...overrides,
  });

const createEscalation = (svc: CollectionsWorkflowService, overrides: Record<string, unknown> = {}) =>
  svc.create({
    kind: 'ESCALATION',
    customerId: 'cust-1',
    branchId: 'br-1',
    priority: 'HIGH',
    ...ACTOR,
    ...overrides,
  });

describe('CollectionsWorkflowService (V23.1 Phase 7)', () => {
  let svc: CollectionsWorkflowService;

  beforeEach(() => {
    svc = new CollectionsWorkflowService();
  });

  describe('create', () => {
    it('creates a callback with the expected default fields', () => {
      const item = createCallback(svc);
      expect(item.kind).toBe('CALLBACK');
      expect(item.status).toBe('OPEN');
      expect(item.priority).toBe('NORMAL');
      expect(item.amountKdSnapshot).toBeNull();
      expect(item.history).toHaveLength(1);
      expect(item.history[0].action).toBe('CREATED');
      expect(item.history[0].actorId).toBe('u1');
    });

    it('creates a promise with an amount snapshot', () => {
      const item = createPromise(svc);
      expect(item.kind).toBe('PROMISE');
      expect(item.amountKdSnapshot).toBe('12.500');
    });

    it('creates an escalation with priority', () => {
      const item = createEscalation(svc);
      expect(item.kind).toBe('ESCALATION');
      expect(item.priority).toBe('HIGH');
    });

    it('rejects callbacks with an amount snapshot (visibility-only invariant)', () => {
      expect(() =>
        svc.create({
          kind: 'CALLBACK',
          customerId: 'cust-1',
          amountKdSnapshot: '5.000',
          ...ACTOR,
        }),
      ).toThrow(BadRequestException);
    });

    it('rejects malformed KWD strings (no math invariant — string format only)', () => {
      expect(() =>
        svc.create({
          kind: 'PROMISE',
          customerId: 'cust-1',
          amountKdSnapshot: '12.5e3', // engineering notation banned
          ...ACTOR,
        }),
      ).toThrow(BadRequestException);
    });

    it('rejects unparseable scheduledAt timestamps', () => {
      expect(() =>
        svc.create({
          kind: 'CALLBACK',
          customerId: 'cust-1',
          scheduledAt: 'next-tuesday',
          ...ACTOR,
        }),
      ).toThrow(BadRequestException);
    });

    it('rejects an empty customerId', () => {
      expect(() =>
        svc.create({
          kind: 'CALLBACK',
          customerId: '',
          ...ACTOR,
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('transition', () => {
    it('moves OPEN → IN_PROGRESS and appends history', () => {
      const item = createCallback(svc);
      const next = svc.transition({
        id: item.id,
        nextStatus: 'IN_PROGRESS',
        notes: 'picked up',
        ...ACTOR,
      });
      expect(next.status).toBe('IN_PROGRESS');
      expect(next.history).toHaveLength(2);
      expect(next.history[1].action).toBe('UPDATED');
      expect(next.history[1].notes).toBe('picked up');
    });

    it('moves OPEN → COMPLETED, sets resolution metadata', () => {
      const item = createCallback(svc);
      const next = svc.transition({
        id: item.id,
        nextStatus: 'COMPLETED',
        ...ACTOR,
      });
      expect(next.status).toBe('COMPLETED');
      expect(next.resolvedAt).not.toBeNull();
      expect(next.resolvedById).toBe('u1');
    });

    it('rejects transitions out of terminal states', () => {
      const item = createCallback(svc);
      svc.transition({ id: item.id, nextStatus: 'COMPLETED', ...ACTOR });
      expect(() =>
        svc.transition({ id: item.id, nextStatus: 'OPEN', ...ACTOR }),
      ).toThrow(BadRequestException);
    });

    it('only allows BROKEN on promises', () => {
      const cb = createCallback(svc);
      expect(() =>
        svc.transition({ id: cb.id, nextStatus: 'BROKEN', ...ACTOR }),
      ).toThrow(BadRequestException);

      const pr = createPromise(svc);
      const next = svc.transition({ id: pr.id, nextStatus: 'BROKEN', ...ACTOR });
      expect(next.status).toBe('BROKEN');
    });

    it('throws NotFound for unknown ids', () => {
      expect(() =>
        svc.transition({ id: 'no-such-id', nextStatus: 'COMPLETED', ...ACTOR }),
      ).toThrow(NotFoundException);
    });
  });

  describe('claim / release', () => {
    it('records ownership and history entry', () => {
      const item = createCallback(svc);
      const owned = svc.claim({ id: item.id, ...ACTOR });
      expect(owned.ownedById).toBe('u1');
      expect(owned.history.at(-1)?.action).toBe('OWNED');
    });

    it('releases ownership when release=true', () => {
      const item = createCallback(svc);
      svc.claim({ id: item.id, ...ACTOR });
      const released = svc.claim({ id: item.id, release: true, ...ACTOR });
      expect(released.ownedById).toBeNull();
      expect(released.history.at(-1)?.action).toBe('RELEASED');
    });

    it('refuses to claim a terminal item', () => {
      const item = createCallback(svc);
      svc.transition({ id: item.id, nextStatus: 'COMPLETED', ...ACTOR });
      expect(() => svc.claim({ id: item.id, ...ACTOR })).toThrow(BadRequestException);
    });
  });

  describe('list / queueSnapshot', () => {
    it('returns a 3-laned snapshot of OPEN/IN_PROGRESS items only', () => {
      createCallback(svc);
      const promise = createPromise(svc);
      createEscalation(svc);
      svc.transition({ id: promise.id, nextStatus: 'COMPLETED', ...ACTOR });

      const snap = svc.queueSnapshot();
      expect(snap.callbacks).toHaveLength(1);
      expect(snap.promises).toHaveLength(0);
      expect(snap.escalations).toHaveLength(1);
    });

    it('respects branch scope on snapshot', () => {
      createCallback(svc, { branchId: 'br-1' });
      createCallback(svc, { customerId: 'cust-2', branchId: 'br-2' });
      const snap = svc.queueSnapshot({ branchId: 'br-1' });
      expect(snap.callbacks).toHaveLength(1);
      expect(snap.callbacks[0].branchId).toBe('br-1');
    });

    it('filters by kind / status / customer', () => {
      createCallback(svc);
      createPromise(svc);
      createEscalation(svc);
      expect(svc.list({ kind: 'PROMISE' })).toHaveLength(1);
      expect(svc.list({ customerId: 'cust-1', kind: 'CALLBACK' })).toHaveLength(1);
      expect(svc.list({ status: 'COMPLETED' })).toHaveLength(0);
    });

    it('returns most-recent-first ordering', () => {
      const a = createCallback(svc, { customerId: 'a' });
      // ensure distinct createdAt
      const b = createCallback(svc, { customerId: 'b' });
      const list = svc.list({});
      expect(list[0].id).toBe(b.id);
      expect(list[1].id).toBe(a.id);
    });
  });

  describe('memory bounds + retention', () => {
    it('evicts items resolved older than RESOLVED_RETENTION_MS on snapshot', () => {
      const before = Date.UTC(2026, 0, 1, 12, 0, 0);
      const item = svc.create({
        kind: 'CALLBACK',
        customerId: 'cust-1',
        ...ACTOR,
        now: before,
      });
      svc.transition({
        id: item.id,
        nextStatus: 'COMPLETED',
        ...ACTOR,
        now: before,
      });
      // Sweep at "now" well past the retention horizon.
      const after = before + RESOLVED_RETENTION_MS + 60_000;
      expect(svc.sizeForTest(after)).toBe(0);
    });

    it('keeps OPEN items even if very old', () => {
      const before = Date.UTC(2026, 0, 1, 12, 0, 0);
      svc.create({
        kind: 'CALLBACK',
        customerId: 'cust-1',
        ...ACTOR,
        now: before,
      });
      const after = before + RESOLVED_RETENTION_MS * 5;
      expect(svc.sizeForTest(after)).toBe(1);
    });
  });

  describe('history audit invariant', () => {
    it('every state transition appends an event (append-only)', () => {
      const item = createPromise(svc);
      const inProg = svc.transition({ id: item.id, nextStatus: 'IN_PROGRESS', ...ACTOR });
      const broken = svc.transition({ id: item.id, nextStatus: 'BROKEN', ...ACTOR, notes: 'no answer' });
      expect(inProg.history.map((h) => h.action)).toEqual(['CREATED', 'UPDATED']);
      expect(broken.history.map((h) => h.action)).toEqual(['CREATED', 'UPDATED', 'BROKEN']);
      expect(broken.history.at(-1)?.notes).toBe('no answer');
    });
  });

  describe('discriminator coverage', () => {
    it.each(['CALLBACK', 'PROMISE', 'ESCALATION'] as WorkflowKind[])(
      'creates kind=%s without behavioural drift',
      (kind) => {
        const item = svc.create({
          kind,
          customerId: 'cust-1',
          amountKdSnapshot: kind === 'PROMISE' ? '5.000' : null,
          ...ACTOR,
        });
        expect(item.kind).toBe(kind);
        expect(item.status).toBe('OPEN');
      },
    );
  });
});

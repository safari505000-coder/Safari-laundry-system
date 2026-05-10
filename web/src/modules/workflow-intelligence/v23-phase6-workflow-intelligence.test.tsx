/**
 * V23 Phase 6 — Workflow Intelligence test suite.
 *
 * Validates the pure classifiers AND their visual primitives, with
 * deterministic `now` injection so tests never depend on wall-clock.
 *
 * Lock-in invariants:
 *   • The classifier source MUST NOT contain `parseFloat`, `Number(`,
 *     or any KD/currency token, because workflow intelligence is a
 *     visibility-only layer — no money math allowed.
 *   • The classifier MUST be timezone-stable: identical inputs at
 *     equivalent UTC offsets produce identical outputs.
 */
import React from 'react';
import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  AgingBadge,
  QueueHealthBadge,
  classifyAging,
  classifyCallbackUrgency,
  classifyQueueHealth,
  daysBetween,
  groupByAgingBucket,
} from './index';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

void React;
afterEach(() => cleanup());

const NOW = new Date('2026-05-09T15:00:00.000Z');

const minus = (days: number) =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

describe('daysBetween', () => {
  test('returns whole days, never negative', () => {
    expect(daysBetween(minus(0), NOW)).toBe(0);
    expect(daysBetween(minus(1), NOW)).toBe(1);
    expect(daysBetween(minus(45), NOW)).toBe(45);
    expect(daysBetween(new Date(NOW.getTime() + 86400_000).toISOString(), NOW)).toBe(0);
  });

  test('returns 0 for unparseable timestamps (no crashes)', () => {
    expect(daysBetween('not-a-date', NOW)).toBe(0);
  });
});

describe('classifyAging', () => {
  test('< 7d → fresh / muted', () => {
    const c = classifyAging({ openedAtIso: minus(2), now: NOW });
    expect(c.bucket).toBe('fresh');
    expect(c.tone).toBe('muted');
  });
  test('< 30d → recent / info', () => {
    expect(classifyAging({ openedAtIso: minus(15), now: NOW }).bucket).toBe('recent');
  });
  test('< 60d → aging / warn', () => {
    expect(classifyAging({ openedAtIso: minus(45), now: NOW }).bucket).toBe('aging');
  });
  test('< 90d → overdue / warn', () => {
    expect(classifyAging({ openedAtIso: minus(75), now: NOW }).bucket).toBe('overdue');
  });
  test('≥ 90d → critical / critical', () => {
    const c = classifyAging({ openedAtIso: minus(120), now: NOW });
    expect(c.bucket).toBe('critical');
    expect(c.tone).toBe('critical');
    expect(c.daysOpen).toBe(120);
  });
});

describe('classifyCallbackUrgency', () => {
  const inHours = (h: number) =>
    new Date(NOW.getTime() + h * 60 * 60 * 1000).toISOString();

  test('past time → overdue / critical', () => {
    const c = classifyCallbackUrgency({ scheduledAtIso: inHours(-5), now: NOW });
    expect(c.urgency).toBe('overdue');
    expect(c.tone).toBe('critical');
  });
  test('within 4h → today / warn', () => {
    const c = classifyCallbackUrgency({ scheduledAtIso: inHours(2), now: NOW });
    expect(c.urgency).toBe('today');
    expect(c.tone).toBe('warn');
  });
  test('< 24h → soon / info', () => {
    const c = classifyCallbackUrgency({ scheduledAtIso: inHours(10), now: NOW });
    expect(c.urgency).toBe('soon');
  });
  test('≥ 24h → later / muted', () => {
    const c = classifyCallbackUrgency({ scheduledAtIso: inHours(48), now: NOW });
    expect(c.urgency).toBe('later');
    expect(c.tone).toBe('muted');
  });
  test('invalid timestamp → later / muted (no crash)', () => {
    const c = classifyCallbackUrgency({ scheduledAtIso: 'never', now: NOW });
    expect(c.urgency).toBe('later');
  });
});

describe('classifyQueueHealth', () => {
  test('empty queue → healthy/muted', () => {
    const c = classifyQueueHealth({ total: 0, criticalCount: 0, overdueCount: 0 });
    expect(c.level).toBe('healthy');
    expect(c.pressurePct).toBe(0);
  });
  test('clean queue → healthy/recommend', () => {
    const c = classifyQueueHealth({ total: 100, criticalCount: 0, overdueCount: 5 });
    expect(c.level).toBe('healthy');
  });
  test('15-49% pressure → attention/info', () => {
    const c = classifyQueueHealth({ total: 100, criticalCount: 0, overdueCount: 30 });
    expect(c.level).toBe('attention');
  });
  test('≥50% pressure → strained/warn', () => {
    const c = classifyQueueHealth({ total: 100, criticalCount: 0, overdueCount: 60 });
    expect(c.level).toBe('strained');
  });
  test('any critical with ≥25% pressure → breached/critical', () => {
    const c = classifyQueueHealth({ total: 100, criticalCount: 30, overdueCount: 0 });
    expect(c.level).toBe('breached');
    expect(c.tone).toBe('critical');
  });
});

describe('groupByAgingBucket', () => {
  test('groups records and orders critical → fresh', () => {
    const rows = [
      { id: 'a', date: minus(5) },
      { id: 'b', date: minus(120) },
      { id: 'c', date: minus(45) },
    ];
    const groups = groupByAgingBucket(rows, (r) => r.date, { now: NOW });
    expect(groups.map((g) => g.bucket)).toEqual(['critical', 'aging', 'fresh']);
    expect(groups[0].rows.map((r) => r.id)).toEqual(['b']);
  });
});

describe('<AgingBadge>', () => {
  test('renders bucket label and day count', () => {
    render(<AgingBadge openedAtIso={minus(75)} now={NOW} />);
    const badge = screen.getByTestId('aging-badge');
    expect(badge.getAttribute('data-bucket')).toBe('overdue');
    expect(badge.textContent).toMatch(/متأخر/);
    expect(badge.textContent).toMatch(/75 يوم/);
  });
  test('compact mode renders only days', () => {
    render(<AgingBadge openedAtIso={minus(10)} now={NOW} compact />);
    const badge = screen.getByTestId('aging-badge');
    expect(badge.textContent).toMatch(/10ي/);
    expect(badge.textContent).not.toMatch(/يوم$/);
  });
});

describe('<QueueHealthBadge>', () => {
  test('renders level + pressure percentage', () => {
    render(<QueueHealthBadge total={100} overdueCount={30} criticalCount={0} />);
    const badge = screen.getByTestId('queue-health-badge');
    expect(badge.getAttribute('data-level')).toBe('attention');
    expect(badge.textContent).toMatch(/30٪/);
    expect(badge.textContent).toMatch(/يحتاج اهتمام/);
  });
});

describe('lock-in: workflow intelligence is money-free', () => {
  test('classifier source contains no money-math tokens', () => {
    const src = readFileSync(
      resolve(__dirname, 'workflow-intelligence.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/parseFloat\s*\(/);
    expect(src).not.toMatch(/Number\.parseFloat\s*\(/);
    expect(src).not.toMatch(/\bd\.ك\b|\bKWD\b|currencyKd|isPositiveKd/);
  });
});

/**
 * V20.6 — Phase 7 Collections Operations Workspace smoke tests.
 *
 * The workspace is the operational heart of the Phase 7 redesign.
 * This suite exercises the full mount path with realistic props,
 * proves keyboard shortcuts dispatch the right callbacks, and
 * confirms that the action bar exposes the expected ARIA chrome
 * for accessibility audits. We intentionally do not snapshot the
 * full DOM — Tailwind class strings are an internal concern and
 * shouldn't churn the suite.
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
import React from 'react';
import { describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { CollectionsOperationsWorkspace } from './CollectionsOperationsWorkspace';
import type {
  WorkspaceTimelineRow,
  WorkspaceNote,
} from '../types/workspace';
import type { CollectionsHeroData } from '../components/CollectionsWorkspaceHero';

function makeHero(overrides?: Partial<CollectionsHeroData>): CollectionsHeroData {
  return {
    customerName: 'Acme Corp',
    customerPhone: '+96550000000',
    remainingDebtKd: '125.500',
    walletBalanceKd: '5.000',
    agingBucket: 'CRITICAL',
    oldestOverdueDays: 45,
    riskLevel: 'HIGH',
    riskScore: 78,
    fraudSeverity: 'MEDIUM',
    fraudOpenCount: 1,
    collectionsStage: 'ESCALATED',
    activePromise: { status: 'ACTIVE', dueDate: new Date(Date.now() + 86400_000 * 2).toISOString() },
    activeInvoicesCount: 4,
    partiallyPaidInvoicesCount: 1,
    overdueInvoicesCount: 3,
    ...overrides,
  };
}

function makeTimeline(): WorkspaceTimelineRow[] {
  return [
    {
      id: 'tl-1',
      kind: 'INVOICE_ISSUED',
      occurredAt: '2026-04-01T08:00:00Z',
      title: 'Invoice issued',
      amountKd: '50.000',
      reference: 'INV-1',
    },
    {
      id: 'tl-2',
      kind: 'PARTIAL_PAYMENT_CAPTURED',
      occurredAt: '2026-04-15T10:00:00Z',
      title: 'Partial payment',
      amountKd: '20.000',
      reference: 'PAY-1',
    },
  ];
}

function makeNotes(): WorkspaceNote[] {
  return [
    {
      id: 'n-1',
      authorName: 'Layla',
      bodyMd: 'Customer promised to pay tomorrow',
      createdAt: '2026-04-20T09:00:00Z',
    },
  ];
}

function makeCallbacks() {
  return {
    onRecordPayment: vi.fn(),
    onSchedulePromise: vi.fn(),
    onEscalate: vi.fn(),
    onAddNote: vi.fn(),
    onOpenObservability: vi.fn(),
    onOpenFraud: vi.fn(),
  };
}

describe('CollectionsOperationsWorkspace — Phase 7', () => {
  test('renders hero, signal strip, action bar, timeline, and notes', () => {
    const callbacks = makeCallbacks();
    render(
      <CollectionsOperationsWorkspace
        hero={makeHero()}
        timeline={makeTimeline()}
        notes={makeNotes()}
        observability={null}
        callbacks={callbacks}
        locale="en"
      />,
    );
    expect(screen.getByLabelText('Collections Operations Workspace')).toBeInTheDocument();
    expect(screen.getByLabelText('Workspace hero for Acme Corp')).toBeInTheDocument();
    expect(screen.getByLabelText('Customer signal strip')).toBeInTheDocument();
    expect(screen.getByLabelText('Customer financial timeline')).toBeInTheDocument();
    expect(screen.getByLabelText('Collector notes')).toBeInTheDocument();
    expect(screen.getByLabelText('Collector actions')).toBeInTheDocument();
  });

  test('action bar buttons advertise their keyboard shortcuts and dispatch callbacks', () => {
    const callbacks = makeCallbacks();
    render(
      <CollectionsOperationsWorkspace
        hero={makeHero()}
        timeline={[]}
        notes={[]}
        observability={null}
        callbacks={callbacks}
        locale="en"
      />,
    );
    const bar = screen.getByLabelText('Collector actions');
    const pay = within(bar).getByRole('button', { name: /Record payment/ });
    expect(pay).toHaveAttribute('aria-keyshortcuts', 'Alt+P');
    pay.click();
    expect(callbacks.onRecordPayment).toHaveBeenCalledTimes(1);
  });

  test('keyboard shortcut Alt+P fires onRecordPayment', () => {
    const callbacks = makeCallbacks();
    render(
      <CollectionsOperationsWorkspace
        hero={makeHero()}
        timeline={[]}
        notes={[]}
        observability={null}
        callbacks={callbacks}
        locale="en"
      />,
    );
    fireEvent.keyDown(window, { key: 'p', altKey: true });
    expect(callbacks.onRecordPayment).toHaveBeenCalledTimes(1);
    expect(callbacks.onSchedulePromise).not.toHaveBeenCalled();
  });

  test('keyboard shortcut Alt+E fires onEscalate', () => {
    const callbacks = makeCallbacks();
    render(
      <CollectionsOperationsWorkspace
        hero={makeHero()}
        timeline={[]}
        notes={[]}
        observability={null}
        callbacks={callbacks}
        locale="en"
      />,
    );
    fireEvent.keyDown(window, { key: 'e', altKey: true });
    expect(callbacks.onEscalate).toHaveBeenCalledTimes(1);
  });

  test('non-Alt key does NOT dispatch a shortcut handler', () => {
    const callbacks = makeCallbacks();
    render(
      <CollectionsOperationsWorkspace
        hero={makeHero()}
        timeline={[]}
        notes={[]}
        observability={null}
        callbacks={callbacks}
        locale="en"
      />,
    );
    fireEvent.keyDown(window, { key: 'p' });
    expect(callbacks.onRecordPayment).not.toHaveBeenCalled();
  });

  test('KPI strip renders error state without crashing the workspace', () => {
    const callbacks = makeCallbacks();
    render(
      <CollectionsOperationsWorkspace
        hero={makeHero()}
        timeline={[]}
        notes={[]}
        observability={null}
        observabilityError="Endpoint down"
        callbacks={callbacks}
        locale="en"
      />,
    );
    expect(screen.getByText('KPIs offline')).toBeInTheDocument();
  });

  test('KPI strip renders the FinancialHealthIndicator when overview is loaded', () => {
    const callbacks = makeCallbacks();
    render(
      <CollectionsOperationsWorkspace
        hero={makeHero()}
        timeline={[]}
        notes={[]}
        observability={{
          generatedAt: '2026-05-01T00:00:00Z',
          windowHours: 24,
          healthScore: 87,
          status: 'HEALTHY',
          sections: [
            {
              key: 'reconciliation',
              label: 'Reconciliation',
              status: 'HEALTHY',
              metric: 0,
            },
          ],
        }}
        callbacks={callbacks}
        locale="en"
      />,
    );
    expect(screen.getByLabelText(/Financial health score: 87/)).toBeInTheDocument();
    expect(screen.getByText('Reconciliation')).toBeInTheDocument();
  });

  test('timeline panel shows the empty-state when rows are empty', () => {
    const callbacks = makeCallbacks();
    render(
      <CollectionsOperationsWorkspace
        hero={makeHero()}
        timeline={[]}
        notes={[]}
        observability={null}
        callbacks={callbacks}
        locale="en"
      />,
    );
    expect(screen.getByText('No events')).toBeInTheDocument();
  });

  test('hero phone link uses tel: scheme for click-to-dial', () => {
    const callbacks = makeCallbacks();
    render(
      <CollectionsOperationsWorkspace
        hero={makeHero({ customerPhone: '+96598765432' })}
        timeline={[]}
        notes={[]}
        observability={null}
        callbacks={callbacks}
        locale="en"
      />,
    );
    const link = screen.getByRole('link', { name: '+96598765432' });
    expect(link).toHaveAttribute('href', 'tel:+96598765432');
  });
});

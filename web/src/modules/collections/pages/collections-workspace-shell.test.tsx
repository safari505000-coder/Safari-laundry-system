/**
 * V20.7 — Phase 5 Collections Workspace Shell smoke tests.
 *
 * Three-pane split-view shell. We assert:
 *
 *   • All three panes mount with realistic props
 *   • Queue selection emits the customer id
 *   • Queue search filters the visible rows
 *   • Empty hero shows the "pick a customer" prompt
 *   • Quick-action shortcuts are wired (click + keyboard Alt+P)
 *   • Disabled shortcuts when no customer is selected
 *   • Last-action footer renders when supplied
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
import React from 'react';
import { describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { CollectionsWorkspaceShell } from './CollectionsWorkspaceShell';
import type { QueueCustomer } from '../components/CollectionsQueuePanel';
import type { CollectionsHeroData } from '../components/CollectionsWorkspaceHero';

function makeQueue(): QueueCustomer[] {
  return [
    {
      id: 'c1',
      name: 'Acme Corp',
      phone: '+96550000001',
      remainingDebtKd: '125.500',
      agingBucket: 'CRITICAL',
      oldestOverdueDays: 45,
      riskLevel: 'HIGH',
      activePromise: { status: 'ACTIVE', dueDate: null },
    },
    {
      id: 'c2',
      name: 'Beta LLC',
      phone: '+96550000002',
      remainingDebtKd: '12.000',
      agingBucket: 'LATE',
      riskLevel: 'MEDIUM',
    },
    {
      id: 'c3',
      name: 'Gamma Inc',
      phone: '+96550000003',
      remainingDebtKd: '0.000',
      agingBucket: 'CURRENT',
      riskLevel: 'LOW',
    },
  ];
}

function makeHero(name = 'Acme Corp'): CollectionsHeroData {
  return {
    customerName: name,
    customerPhone: '+96550000001',
    remainingDebtKd: '125.500',
    walletBalanceKd: '5.000',
    agingBucket: 'CRITICAL',
    oldestOverdueDays: 45,
    riskLevel: 'HIGH',
    riskScore: 78,
    fraudSeverity: 'MEDIUM',
    fraudOpenCount: 1,
    collectionsStage: 'ESCALATED',
    activePromise: null,
    activeInvoicesCount: 4,
  };
}

function makeCallbacks() {
  return {
    onSelectCustomer: vi.fn(),
    onNextCustomer: vi.fn(),
    onRecordPayment: vi.fn(),
    onSchedulePromise: vi.fn(),
    onEscalate: vi.fn(),
    onAddNote: vi.fn(),
    onOpenObservability: vi.fn(),
    onOpenFraud: vi.fn(),
  };
}

describe('CollectionsWorkspaceShell — V20.7 Phase 5', () => {
  test('mounts all three panes with realistic props', () => {
    const cb = makeCallbacks();
    render(
      <CollectionsWorkspaceShell
        queue={makeQueue()}
        selectedCustomerId="c1"
        hero={makeHero()}
        timeline={[]}
        notes={[]}
        observability={null}
        {...cb}
        locale="en"
      />,
    );
    expect(
      screen.getByLabelText('Collections Operations Workspace (split-view)'),
    ).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Customer queue' })).toBeInTheDocument();
    expect(
      screen.getByRole('complementary', { name: 'Quick actions' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Customer financial header: Acme Corp/)).toBeInTheDocument();
  });

  test('queue selection emits onSelectCustomer with the id', () => {
    const cb = makeCallbacks();
    render(
      <CollectionsWorkspaceShell
        queue={makeQueue()}
        selectedCustomerId={null}
        hero={null}
        timeline={[]}
        notes={[]}
        observability={null}
        {...cb}
        locale="en"
      />,
    );
    const queue = screen.getByRole('navigation', { name: 'Customer queue' });
    within(queue).getByRole('button', { name: /Acme Corp/ }).click();
    expect(cb.onSelectCustomer).toHaveBeenCalledWith('c1');
  });

  test('queue search filters the visible rows', () => {
    const cb = makeCallbacks();
    render(
      <CollectionsWorkspaceShell
        queue={makeQueue()}
        selectedCustomerId={null}
        hero={null}
        timeline={[]}
        notes={[]}
        observability={null}
        {...cb}
        locale="en"
      />,
    );
    const search = screen.getByLabelText('Search') as HTMLInputElement;
    fireEvent.change(search, { target: { value: 'beta' } });
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  test('empty hero renders the pick-a-customer prompt', () => {
    const cb = makeCallbacks();
    render(
      <CollectionsWorkspaceShell
        queue={makeQueue()}
        selectedCustomerId={null}
        hero={null}
        timeline={[]}
        notes={[]}
        observability={null}
        {...cb}
        locale="en"
      />,
    );
    expect(screen.getByText('Pick a customer from the queue')).toBeInTheDocument();
  });

  test('quick-action shortcuts disabled when no hero is loaded', () => {
    const cb = makeCallbacks();
    render(
      <CollectionsWorkspaceShell
        queue={makeQueue()}
        selectedCustomerId={null}
        hero={null}
        timeline={[]}
        notes={[]}
        observability={null}
        {...cb}
        locale="en"
      />,
    );
    const quick = screen.getByRole('complementary', { name: 'Quick actions' });
    expect(within(quick).getByRole('button', { name: /Record payment/ })).toBeDisabled();
  });

  test('Alt+P fires the payment callback when a hero is loaded', () => {
    const cb = makeCallbacks();
    render(
      <CollectionsWorkspaceShell
        queue={makeQueue()}
        selectedCustomerId="c1"
        hero={makeHero()}
        timeline={[]}
        notes={[]}
        observability={null}
        {...cb}
        locale="en"
      />,
    );
    fireEvent.keyDown(window, { key: 'p', altKey: true });
    expect(cb.onRecordPayment).toHaveBeenCalledTimes(1);
  });

  test('Alt+S advances to the next customer when onNextCustomer is provided', () => {
    const cb = makeCallbacks();
    render(
      <CollectionsWorkspaceShell
        queue={makeQueue()}
        selectedCustomerId="c1"
        hero={makeHero()}
        timeline={[]}
        notes={[]}
        observability={null}
        {...cb}
        locale="en"
      />,
    );
    fireEvent.keyDown(window, { key: 's', altKey: true });
    expect(cb.onNextCustomer).toHaveBeenCalledTimes(1);
  });

  test('last-action footer renders when supplied', () => {
    const cb = makeCallbacks();
    render(
      <CollectionsWorkspaceShell
        queue={makeQueue()}
        selectedCustomerId="c1"
        hero={makeHero()}
        timeline={[]}
        notes={[]}
        observability={null}
        lastActionLabel="Recorded payment 50.000"
        lastActionAt="2026-05-01T10:00:00Z"
        {...cb}
        locale="en"
      />,
    );
    expect(screen.getByText(/Recorded payment 50\.000/)).toBeInTheDocument();
  });
});

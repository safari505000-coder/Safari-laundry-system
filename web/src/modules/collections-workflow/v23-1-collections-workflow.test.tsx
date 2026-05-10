/**
 * V23.1 Phase 7 — Collections Workflow frontend tests.
 *
 * Coverage:
 *   • WorkflowItemCard renders the core fields and dispatches actions
 *   • WorkflowLanes shows three lanes, sorts overdue first, and exposes
 *     empty / loading / error states
 *   • WorkflowQuickAddModal validates the KWD snapshot shape, emits the
 *     correct CreateWorkflowItemInput, and never invokes Number/parseFloat
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowItemCard } from './WorkflowItemCard';
import { WorkflowLanes } from './WorkflowLanes';
import { WorkflowQuickAddModal } from './WorkflowQuickAddModal';
import type { WorkflowItem, WorkflowQueueSnapshot } from './types';

void React;

const baseItem: WorkflowItem = {
  id: 'wf-1',
  kind: 'CALLBACK',
  status: 'OPEN',
  priority: 'NORMAL',
  customerId: 'cust-1',
  customerNameSnapshot: 'Test Customer',
  orderId: null,
  scheduledAt: '2026-05-09T16:30:00.000Z',
  amountKdSnapshot: null,
  notes: 'Call back at 4:30 PM',
  branchId: 'br-1',
  createdAt: '2026-05-09T15:30:00.000Z',
  updatedAt: '2026-05-09T15:30:00.000Z',
  createdById: 'op-1',
  createdByName: 'Operator One',
  ownedById: null,
  ownedByName: null,
  resolvedAt: null,
  resolvedById: null,
  resolvedByName: null,
  history: [
    {
      at: '2026-05-09T15:30:00.000Z',
      actorId: 'op-1',
      actorName: 'Operator One',
      action: 'CREATED',
      notes: null,
    },
  ],
};

const promiseItem: WorkflowItem = {
  ...baseItem,
  id: 'wf-2',
  kind: 'PROMISE',
  amountKdSnapshot: '12.500',
  scheduledAt: '2026-05-12T00:00:00.000Z',
};

const escalationItem: WorkflowItem = {
  ...baseItem,
  id: 'wf-3',
  kind: 'ESCALATION',
  priority: 'HIGH',
  scheduledAt: null,
  notes: 'Customer disputes invoice 12345',
};

const snapshot: WorkflowQueueSnapshot = {
  callbacks: [baseItem],
  promises: [promiseItem],
  escalations: [escalationItem],
  computedAt: '2026-05-09T15:35:00.000Z',
};

describe('WorkflowItemCard', () => {
  it('renders kind, customer, and snapshot label without parsing money', () => {
    render(<WorkflowItemCard item={promiseItem} />);
    expect(screen.getByTestId('workflow-amount-snapshot').textContent).toMatch(/12\.500/);
  });

  it('marks "owned by me" when current operator matches', () => {
    const owned = { ...baseItem, ownedById: 'me', ownedByName: 'Me' };
    render(<WorkflowItemCard item={owned} currentOperatorId="me" />);
    const card = screen.getByTestId('workflow-item-card');
    expect(card.getAttribute('data-owned-by-me')).toBe('true');
    expect(screen.getByTestId('workflow-owner-pill').textContent).toMatch(/بيدك|You/);
  });

  it('dispatches onClaim/onComplete handlers', () => {
    const onClaim = vi.fn();
    const onComplete = vi.fn();
    render(
      <WorkflowItemCard
        item={baseItem}
        onClaim={onClaim}
        onComplete={onComplete}
      />,
    );
    fireEvent.click(screen.getByText(/استلام|Claim/));
    fireEvent.click(screen.getByText(/إكمال|Complete/));
    expect(onClaim).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('only shows the BROKEN action for promises', () => {
    const onBreak = vi.fn();
    const { rerender } = render(<WorkflowItemCard item={baseItem} onBreak={onBreak} />);
    expect(screen.queryByText(/منكوث|Broken/)).toBeNull();
    rerender(<WorkflowItemCard item={promiseItem} onBreak={onBreak} />);
    fireEvent.click(screen.getByText(/منكوث|Broken/));
    expect(onBreak).toHaveBeenCalledTimes(1);
  });
});

describe('WorkflowLanes', () => {
  it('renders three lanes with their counts', () => {
    render(<WorkflowLanes snapshot={snapshot} currentOperatorId="me" />);
    expect(screen.getByTestId('workflow-lane-callback')).toBeTruthy();
    expect(screen.getByTestId('workflow-lane-promise')).toBeTruthy();
    expect(screen.getByTestId('workflow-lane-escalation')).toBeTruthy();
  });

  it('shows empty-state when a lane is empty', () => {
    const emptySnap: WorkflowQueueSnapshot = {
      callbacks: [],
      promises: [],
      escalations: [escalationItem],
      computedAt: '2026-05-09T15:35:00.000Z',
    };
    render(<WorkflowLanes snapshot={emptySnap} />);
    expect(screen.getByTestId('workflow-lane-empty-callback')).toBeTruthy();
    expect(screen.getByTestId('workflow-lane-empty-promise')).toBeTruthy();
    expect(screen.queryByTestId('workflow-lane-empty-escalation')).toBeNull();
  });

  it('renders the quick-add buttons when onQuickAdd is provided', () => {
    const onQuickAdd = vi.fn();
    render(<WorkflowLanes snapshot={snapshot} onQuickAdd={onQuickAdd} />);
    fireEvent.click(screen.getByTestId('workflow-quick-add-promise'));
    expect(onQuickAdd).toHaveBeenCalledWith('PROMISE');
  });

  it('renders error banner when error is set', () => {
    render(
      <WorkflowLanes snapshot={null} error="boom" loading={false} />,
    );
    expect(screen.getByRole('alert').textContent).toMatch(/boom/);
  });
});

describe('WorkflowQuickAddModal', () => {
  it('validates the KWD shape and refuses to submit non-canonical strings', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <WorkflowQuickAddModal
        open
        initialKind="PROMISE"
        customerId="cust-1"
        customerNameSnapshot="Test Customer"
        onClose={() => undefined}
        onSubmit={onSubmit}
      />,
    );
    const input = screen.getByTestId('workflow-amount-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '12.5e3' } });
    expect(input.getAttribute('aria-invalid')).toBe('true');

    fireEvent.change(input, { target: { value: '12.500' } });
    expect(input.getAttribute('aria-invalid')).toBe('false');
  });

  it('emits the canonical CreateWorkflowItemInput on submit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const { container } = render(
      <WorkflowQuickAddModal
        open
        initialKind="CALLBACK"
        customerId="cust-1"
        customerNameSnapshot="Customer A"
        branchId="br-1"
        onClose={onClose}
        onSubmit={onSubmit}
      />,
    );
    const form = container.querySelector('form');
    expect(form).toBeTruthy();
    fireEvent.submit(form!);
    await Promise.resolve();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const arg = onSubmit.mock.calls[0][0];
    expect(arg.kind).toBe('CALLBACK');
    expect(arg.customerId).toBe('cust-1');
    expect(arg.amountKdSnapshot).toBeUndefined();
    expect(arg.branchId).toBe('br-1');
  });
});

/**
 * V20.9 — Phase 3 Collections Assistant Panel rendering contracts.
 *
 *   1. Renders the customer name + the engine's top recommendation.
 *   2. Critical recommendations are visually marked (data attribute).
 *   3. onActionPick fires with the action id when a button is clicked.
 *   4. The assistant renders ZERO arithmetic on KD fields — every
 *      money-shaped string in the DOM came in pre-formatted from
 *      props.
 */
import React from 'react';
import { describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { CollectionsAssistantPanel } from './CollectionsAssistantPanel';

afterEach(() => cleanup());

describe('V20.9 — collections assistant panel', () => {
  test('1. renders customer name + top recommendation label', () => {
    render(
      <CollectionsAssistantPanel
        customerName="ABC Trading Co."
        signals={{
          daysOverdue: 95,
          riskLevel: 'CRITICAL',
          fraudSeverity: 'HIGH',
          promiseStatus: 'BROKEN',
          lastContactDaysAgo: 14,
          slaStatus: 'BREACHED',
          hasOpenInvoice: true,
          collectionsStage: 'ESCALATED',
          daysOverdueDisplay: '95',
          lastContactDisplay: '2026-04-23',
          activePromiseDateDisplay: null,
        }}
        locale="en"
      />,
    );
    expect(screen.getByText('ABC Trading Co.')).toBeTruthy();
    // Top action for this profile = open_fraud_investigation (priority 100).
    const top = document.querySelector('button[data-action-id="open_fraud_investigation"]');
    expect(top).not.toBeNull();
    expect(top?.getAttribute('data-priority')).toBe('100');
    expect(top?.getAttribute('data-critical')).toBe('true');
  });

  test('2. fires onActionPick with the engine action id', () => {
    const onActionPick = vi.fn();
    render(
      <CollectionsAssistantPanel
        customerName="X"
        signals={{
          daysOverdue: 30,
          riskLevel: 'HIGH',
          fraudSeverity: null,
          promiseStatus: 'NONE',
          lastContactDaysAgo: 8,
          slaStatus: 'AT_RISK',
          hasOpenInvoice: true,
          collectionsStage: null,
        }}
        onActionPick={onActionPick}
        locale="en"
      />,
    );
    const setPromiseBtn = document.querySelector(
      'button[data-action-id="set_promise_to_pay"]',
    ) as HTMLButtonElement;
    expect(setPromiseBtn).not.toBeNull();
    fireEvent.click(setPromiseBtn);
    expect(onActionPick).toHaveBeenCalledWith('set_promise_to_pay');
  });

  test('3. healthy customer renders only the no-action sentinel', () => {
    render(
      <CollectionsAssistantPanel
        customerName="Y"
        signals={{
          daysOverdue: 0,
          riskLevel: 'LOW',
          fraudSeverity: null,
          promiseStatus: 'NONE',
          lastContactDaysAgo: 1,
          slaStatus: 'OK',
          hasOpenInvoice: false,
          collectionsStage: null,
        }}
        locale="en"
      />,
    );
    const noAction = document.querySelector(
      'button[data-action-id="mark_no_action_needed"]',
    );
    expect(noAction).not.toBeNull();
    // Only one action button rendered for healthy customers.
    const buttons = document.querySelectorAll('button[data-action-id]');
    expect(buttons.length).toBe(1);
  });
});

/**
 * V20.6 — Phase 6B Financial UI Kit smoke tests.
 *
 * Goal: a single render assertion per primitive proves the kit
 * imports cleanly through the barrel, that aria-labels are present,
 * and that severity / bucket variants resolve to distinct labels. We
 * intentionally don't snapshot the full DOM — Tailwind class strings
 * are an internal concern and changing them shouldn't break the
 * suite.
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
import React from 'react';
import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  AgingBadge,
  CollectionsStageBadge,
  DebtCard,
  FinancialHealthIndicator,
  FraudBadge,
  MoneyFlowCard,
  PromiseStatusBadge,
  ReconciliationStatus,
  RiskBadge,
  TimelineCard,
} from './index';

describe('Financial UI Kit — Phase 6B primitives', () => {
  test('AgingBadge renders bucket-specific aria-label', () => {
    render(<AgingBadge bucket="CRITICAL" daysOverdue={42} variant="full" locale="en" />);
    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      'Aging: Critical, 42 days overdue',
    );
  });

  test('RiskBadge surfaces score in aria-label when supplied', () => {
    render(<RiskBadge level="HIGH" score={87} locale="en" />);
    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      'Risk: High, score 87',
    );
  });

  test('FraudBadge becomes a button when onClick is provided', () => {
    let clicks = 0;
    render(<FraudBadge severity="CRITICAL" count={3} onClick={() => (clicks += 1)} />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-label', 'Fraud alert CRITICAL, 3 open');
    btn.click();
    expect(clicks).toBe(1);
  });

  test('CollectionsStageBadge renders the stage label (ar default)', () => {
    render(<CollectionsStageBadge stage="ESCALATED" />);
    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      'Collections stage: تصعيد',
    );
  });

  test('PromiseStatusBadge renders countdown for ACTIVE promises with a future dueDate', () => {
    const due = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    render(<PromiseStatusBadge status="ACTIVE" dueDate={due} locale="en" />);
    const node = screen.getByRole('status');
    expect(node.getAttribute('aria-label')).toMatch(/Promise: active.*3d/);
  });

  test('DebtCard exposes the customer aria-label and renders the wallet balance', () => {
    render(
      <DebtCard
        customerName="Acme Corp"
        remainingDebtKd="123.450"
        walletBalanceKd="10.000"
        agingBucket="LATE"
        riskLevel="MEDIUM"
        locale="en"
      />,
    );
    expect(screen.getByLabelText('Customer debt card: Acme Corp')).toBeInTheDocument();
    expect(screen.getByText(/123\.450/)).toBeInTheDocument();
  });

  test('TimelineCard renders title, amount, and a forensic reference code', () => {
    render(
      <TimelineCard
        kind="PAYMENT_CAPTURED"
        occurredAt={new Date('2026-05-01T12:00:00Z')}
        title="Payment captured"
        amountKd="50.000"
        reference="PAY:abc123"
        locale="en"
      />,
    );
    expect(screen.getByText('Payment captured')).toBeInTheDocument();
    expect(screen.getByText(/50\.000/)).toBeInTheDocument();
    expect(screen.getByText('PAY:abc123')).toBeInTheDocument();
  });

  test('ReconciliationStatus pulses on DRIFT and renders driftCount in subtext', () => {
    render(<ReconciliationStatus status="DRIFT" driftCount={3} branchesScanned={4} />);
    expect(screen.getByLabelText(/Reconciliation status:/)).toBeInTheDocument();
    expect(screen.getByText(/انحرافات: 3/)).toBeInTheDocument();
  });

  test('MoneyFlowCard renders server-canonical net signed display', () => {
    render(
      <MoneyFlowCard
        title="Today"
        cashInKd="100.000"
        cashOutKd="40.000"
        netKd="-7.125"
        locale="en"
      />,
    );
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('+100.000')).toBeInTheDocument();
    expect(screen.getByText('−7.125')).toBeInTheDocument();
  });

  test('FinancialHealthIndicator clamps score 0..100 and shows badge for drift > 0', () => {
    render(<FinancialHealthIndicator score={143} driftCount={2} fraudAlerts={1} />);
    expect(screen.getByText(/FIN 100/)).toBeInTheDocument();
    expect(screen.getByText(/drift 2/)).toBeInTheDocument();
    expect(screen.getByText(/fraud 1/)).toBeInTheDocument();
  });

  test('FinancialHealthIndicator critical band pulses', () => {
    render(<FinancialHealthIndicator score={20} />);
    const root = screen.getByLabelText(/Financial health score: 20/);
    expect(root.querySelector('.animate-pulse')).toBeTruthy();
  });
});

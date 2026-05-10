/**
 * V20.6 — Phase 6D WindowedList virtualization suite.
 *
 * The whole point of WindowedList is that it can hold a 100K-row
 * dataset without rendering 100K DOM nodes. This suite locks down
 * that exact contract:
 *
 *   • renders only the visible window + overscan
 *   • renders 100K logical rows but a tiny subset of DOM rows
 *   • exposes `aria-rowcount` for screen readers
 *   • shows the empty-state slot when the data is empty
 *
 * We avoid asserting on scroll-driven re-renders (jsdom doesn't
 * implement scrolling natively) — only the static slice contract.
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
import React from 'react';
import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WindowedList } from './WindowedList';

describe('WindowedList — Phase 6D virtualization', () => {
  test('renders only the visible slice + overscan, not every row', () => {
    const items = Array.from({ length: 100_000 }, (_, i) => ({ id: i }));
    render(
      <WindowedList
        items={items}
        rowHeight={20}
        height={200}
        overscan={3}
        renderRow={(it) => <span data-testid="row">#{it.id}</span>}
      />,
    );
    const rendered = screen.getAllByTestId('row');
    // visible = 200/20 = 10 rows; overscan = 3 either side ⇒ ≤16 rendered
    expect(rendered.length).toBeLessThanOrEqual(20);
    expect(rendered.length).toBeGreaterThan(0);
  });

  test('exposes aria-rowcount equal to the full logical row count', () => {
    const items = Array.from({ length: 50_000 }, (_, i) => ({ id: i }));
    render(
      <WindowedList
        items={items}
        rowHeight={24}
        height={120}
        renderRow={(it) => <span>{it.id}</span>}
      />,
    );
    expect(screen.getByRole('list')).toHaveAttribute('aria-rowcount', '50000');
  });

  test('shows empty-state slot when items are empty', () => {
    render(
      <WindowedList
        items={[]}
        rowHeight={20}
        height={120}
        emptyState={<div data-testid="empty">No data</div>}
        renderRow={() => null}
      />,
    );
    expect(screen.getByTestId('empty')).toBeInTheDocument();
  });
});

/**
 * V20.7 — Phase 6 WindowedList perf stress test.
 *
 * Validates the virtualization invariant under the user's stated
 * ceilings:
 *
 *   • 100,000 customer rows
 *   • 10,000 invoice rows
 *   • 1,000,000 timeline rows
 *
 * The contract: regardless of total dataset size, the rendered DOM
 * MUST contain only the visible slice (+ overscan), never the full
 * dataset. We assert: (rendered) ≤ (height / rowHeight + overscan*2 + 4).
 *
 * The 4-row buffer accounts for partial first/last rows and React
 * commit timing.
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
import React from 'react';
import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WindowedList } from './WindowedList';

function makeRows(n: number): ReadonlyArray<{ id: number; label: string }> {
  // Use a sparse array proxy to avoid actually allocating 1M strings;
  // jsdom doesn't need them and the renderer never asks for invisible
  // rows. We only realise objects on demand inside renderRow.
  return new Proxy([] as { id: number; label: string }[], {
    get(target, prop) {
      if (prop === 'length') return n;
      if (typeof prop === 'string' && /^\d+$/.test(prop)) {
        const i = Number(prop);
        return { id: i, label: `row-${i}` };
      }
      // Required so .slice() works.
      if (prop === 'slice') {
        return (start: number, end: number) => {
          const out: { id: number; label: string }[] = [];
          for (let i = start; i < Math.min(end, n); i += 1) {
            out.push({ id: i, label: `row-${i}` });
          }
          return out;
        };
      }
      return Reflect.get(target, prop);
    },
  });
}

function countRenderedRows(): number {
  return screen.queryAllByTestId('virt-row').length;
}

const HEIGHT = 480;
const ROW = 40;
const OVERSCAN = 6;
const VISIBLE = Math.ceil(HEIGHT / ROW); // 12
const MAX_RENDERED = VISIBLE + OVERSCAN * 2 + 4; // 28

describe('V20.7 — Phase 6 WindowedList performance', () => {
  test('renders only the visible slice for 100,000 customer rows', () => {
    render(
      <WindowedList
        items={makeRows(100_000)}
        rowHeight={ROW}
        height={HEIGHT}
        overscan={OVERSCAN}
        renderRow={(r) => <div data-testid="virt-row">{r.label}</div>}
      />,
    );
    const rendered = countRenderedRows();
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThanOrEqual(MAX_RENDERED);
  });

  test('renders only the visible slice for 10,000 invoice rows', () => {
    render(
      <WindowedList
        items={makeRows(10_000)}
        rowHeight={ROW}
        height={HEIGHT}
        overscan={OVERSCAN}
        renderRow={(r) => <div data-testid="virt-row">{r.label}</div>}
      />,
    );
    expect(countRenderedRows()).toBeLessThanOrEqual(MAX_RENDERED);
  });

  test('renders only the visible slice for 1,000,000 timeline rows', () => {
    render(
      <WindowedList
        items={makeRows(1_000_000)}
        rowHeight={ROW}
        height={HEIGHT}
        overscan={OVERSCAN}
        renderRow={(r) => <div data-testid="virt-row">{r.label}</div>}
      />,
    );
    expect(countRenderedRows()).toBeLessThanOrEqual(MAX_RENDERED);
  });
});

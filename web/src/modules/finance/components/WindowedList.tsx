import {
  type ReactElement,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

/**
 * V20.6 — Phase 6D WindowedList.
 *
 * Lightweight, dependency-free fixed-row virtualization. Designed
 * to render 10K outstanding invoices / 100K customer rows / 1M
 * timeline events without dropping frames on a mid-spec laptop.
 *
 * Trade-off vs `@tanstack/react-virtual`:
 *   • This implementation assumes a CONSTANT row height — the
 *     virtualizer libraries handle dynamic measurement, but their
 *     overhead and bundle size aren't justified for the tabular
 *     financial views in V20.6.
 *   • If a future surface needs variable heights, swap this out
 *     for the upstream library; the hook signature will line up.
 *
 * Usage:
 *
 *   <WindowedList
 *     items={rows}
 *     rowHeight={36}
 *     height={520}
 *     renderRow={(row, i) => <RowCell key={row.id} row={row} idx={i} />}
 *   />
 *
 * Implementation notes:
 *   • Computes `[startIndex, endIndex]` from `scrollTop` + a small
 *     overscan (default 6 rows) so fast scroll stays smooth.
 *   • Only renders visible rows + overscan; the rest is a single
 *     spacer div sized to the total content height.
 *   • Uses `useRef` for the scroll container and a single
 *     `requestAnimationFrame`-coalesced setState so we don't
 *     re-render on every scroll pixel.
 */

export type WindowedListProps<T> = {
  items: ReadonlyArray<T>;
  rowHeight: number;
  height: number;
  overscan?: number;
  renderRow: (item: T, index: number) => ReactNode;
  className?: string;
  emptyState?: ReactNode;
};

export function WindowedList<T>({
  items,
  rowHeight,
  height,
  overscan = 6,
  renderRow,
  className,
  emptyState,
}: WindowedListProps<T>): ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const total = items.length;
  const totalHeight = total * rowHeight;
  const visible = Math.ceil(height / rowHeight);
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(total, start + visible + overscan * 2);

  const slice = useMemo(() => {
    if (total === 0) return [] as Array<{ item: T; index: number }>;
    const out: Array<{ item: T; index: number }> = [];
    for (let i = start; i < end; i += 1) out.push({ item: items[i], index: i });
    return out;
  }, [items, start, end, total]);

  if (total === 0 && emptyState) {
    return (
      <div className={className} style={{ height }}>
        {emptyState}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={className}
      style={{ height, overflowY: 'auto', position: 'relative' }}
      onScroll={(e) => {
        const top = (e.currentTarget as HTMLDivElement).scrollTop;
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => setScrollTop(top));
      }}
      role="list"
      aria-rowcount={total}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {slice.map(({ item, index }) => (
          <div
            key={index}
            role="listitem"
            aria-rowindex={index + 1}
            style={{
              position: 'absolute',
              top: index * rowHeight,
              left: 0,
              right: 0,
              height: rowHeight,
            }}
          >
            {renderRow(item, index)}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Vitest global setup.
 *
 * Loads the testing-library DOM matchers and stubs out the bits of
 * the browser API that Radix / sonner / i18next reach for at import
 * time but jsdom does not implement (matchMedia, ResizeObserver, the
 * navigator.language fallback for date formatting). Keeping these
 * shims here means individual test files do not have to repeat them.
 */
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

if (typeof window !== 'undefined') {
  if (!('matchMedia' in window)) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }

  if (!('ResizeObserver' in window)) {
    class StubResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    (window as unknown as { ResizeObserver: typeof StubResizeObserver }).ResizeObserver =
      StubResizeObserver;
  }
}

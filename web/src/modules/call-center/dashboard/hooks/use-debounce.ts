import { useEffect, useState } from 'react';

/**
 * Returns a value that lags `value` by `delayMs`. Used to keep
 * keystroke-driven search inputs from spamming the API on every
 * character. The delay restarts on every change, so the network call
 * only fires after the user stops typing.
 */
export function useDebounce<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}

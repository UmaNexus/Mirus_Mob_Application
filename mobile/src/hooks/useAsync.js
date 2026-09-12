import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Loading/error/data state for one async call, re-run on demand via
 * `reload()`. Every screen uses this instead of ad hoc useState/useEffect
 * pairs, so loading/error/empty handling is consistent across the app.
 */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const run = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading', error: null }));
    try {
      const data = await fn();
      if (mounted.current) setState({ status: 'success', data, error: null });
    } catch (err) {
      if (mounted.current) setState({ status: 'error', data: null, error: err.uiMessage || err.message || 'Something went wrong' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { run(); }, [run]);

  return { ...state, reload: run };
}

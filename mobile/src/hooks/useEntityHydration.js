import { useState, useEffect } from 'react';

/**
 * Universal hook for transparently hydrating screen data from either
 * in-memory navigation parameters or an asynchronous API fallback.
 *
 * @param {Object} options
 * @param {Object|null} options.initialEntity - Pre-hydrated object from in-memory navigation
 * @param {string|null} options.entityId - ID passed via deep link or notification
 * @param {Function} options.fetcher - Async API call (e.g. dcrApi.getById, doctorsApi.getById)
 * @returns {{ data: Object|null, loading: boolean, error: Error|null, reload: Function }}
 */
export function useEntityHydration({ initialEntity, entityId, fetcher }) {
  const [data, setData] = useState(initialEntity || null);
  const [loading, setLoading] = useState(!initialEntity && Boolean(entityId));
  const [error, setError] = useState(null);

  const fetchEntity = () => {
    if (initialEntity) {
      setData(initialEntity);
      setLoading(false);
      return;
    }

    if (entityId && fetcher) {
      let isMounted = true;
      setLoading(true);
      setError(null);

      fetcher(entityId)
        .then((result) => {
          if (isMounted) {
            setData(result?.data || result);
            setLoading(false);
          }
        })
        .catch((err) => {
          if (isMounted) {
            setError(err);
            setLoading(false);
          }
        });

      return () => {
        isMounted = false;
      };
    }
  };

  useEffect(() => {
    return fetchEntity();
  }, [initialEntity, entityId]);

  return { data, loading, error, reload: fetchEntity };
}

export default useEntityHydration;

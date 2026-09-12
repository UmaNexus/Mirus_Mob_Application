import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';

/**
 * Re-run `reload` every time this screen regains focus — e.g. returning
 * from a create/edit screen pushed on top of a list. Without this, a list
 * screen only ever fetches once on mount and silently goes stale after the
 * user navigates away and back, even though the save itself succeeded on
 * the backend (found while verifying the DCR flow end-to-end).
 */
export function useRefreshOnFocus(reload) {
  useFocusEffect(
    useCallback(() => {
      reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reload])
  );
}

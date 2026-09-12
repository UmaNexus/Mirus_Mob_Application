import { useMemo, useState } from 'react';

/** Client-side slice helper for HTML tables. */
export default function useClientPager(rows = [], initialLimit = 10) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(initialLimit);
  const total = rows.length;
  const pages = Math.max(Math.ceil(total / limit) || 1, 1);
  const safePage = Math.min(page, pages);

  const pageRows = useMemo(() => {
    const start = (safePage - 1) * limit;
    return rows.slice(start, start + limit);
  }, [rows, safePage, limit]);

  const setLimitAndReset = (n) => {
    setLimit(n);
    setPage(1);
  };

  return {
    page: safePage,
    pages,
    limit,
    total,
    pageRows,
    setPage,
    setLimit: setLimitAndReset
  };
}

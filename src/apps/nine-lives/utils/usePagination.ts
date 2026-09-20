import { useMemo, useState } from 'react';

/** Client-side pagination for a list that's already been filtered/sorted. */
export function usePagination<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const clampedPage = Math.min(page, pageCount);
  const pagedItems = useMemo(
    () => items.slice((clampedPage - 1) * pageSize, clampedPage * pageSize),
    [items, clampedPage, pageSize],
  );

  return {
    page: clampedPage,
    pageCount,
    setPage,
    pagedItems,
    shouldPaginate: items.length > pageSize,
  };
}

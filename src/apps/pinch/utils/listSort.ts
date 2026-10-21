import type { SortOrder } from '@/components/SortControl';
import type { ListSortKey } from '@apps/pinch/types';

export interface ListSort {
  key: ListSortKey;
  order: SortOrder;
}

export const DEFAULT_LIST_SORT: ListSort = { key: 'default', order: 'natural' };

interface Sortable {
  createdAt: number;
  /** Older documents may lack it; the creation time stands in. */
  updatedAt?: number | null;
}

const collator = new Intl.Collator(undefined, {
  sensitivity: 'base',
  numeric: true,
});

const compareNames = (a: string, b: string) => collator.compare(a, b);

/** Dates start newest first and names at A; flipping the order reverses the comparison, never the list, so ties keep the order they came in. */
const getComparison = <T extends Sortable>(
  key: Exclude<ListSortKey, 'default'>,
  getName: (item: T) => string,
) => {
  if (key === 'alpha') {
    return (a: T, b: T) => compareNames(getName(a), getName(b));
  }
  if (key === 'created') return (a: T, b: T) => b.createdAt - a.createdAt;

  return (a: T, b: T) =>
    (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt);
};

/** The items in the chosen order. The default keeps the order given (the caller's own, stars first); any other sort ignores stars. */
export const sortList = <T extends Sortable>(
  items: readonly T[],
  sort: ListSort,
  getName: (item: T) => string,
): T[] => {
  if (sort.key === 'default') return [...items];

  const compare = getComparison(sort.key, getName);
  const direction = sort.order === 'natural' ? 1 : -1;
  const result = [...items].sort((a, b) => direction * compare(a, b));

  return result;
};

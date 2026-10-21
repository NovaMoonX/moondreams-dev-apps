import SortControl from '@/components/SortControl';
import {
  LIST_SORT_OPTIONS,
  LIST_SORT_ORDER_LABELS,
} from '@apps/pinch/constants';
import type { ListSortKey } from '@apps/pinch/types';
import { DEFAULT_LIST_SORT, type ListSort } from '@apps/pinch/utils/listSort';

const getOrderOptions = (key: ListSortKey) => {
  if (key === 'default') return null;

  const [first, second] = LIST_SORT_ORDER_LABELS[key];
  return [
    { value: 'natural', label: first },
    { value: 'reversed', label: second },
  ] as const;
};

interface ListSortControlProps {
  /** Names the button and says what it sorts ("Sort recipes"). */
  label: string;
  sort: ListSort;
  onChange: (sort: ListSort) => void;
}

/** The sort icon beside a Recipes view's search: Default, Date created, Last edited and Name, each in two directions. */
function ListSortControl({ label, sort, onChange }: ListSortControlProps) {
  return (
    <SortControl
      label={label}
      options={LIST_SORT_OPTIONS}
      value={sort.key}
      defaultValue={DEFAULT_LIST_SORT.key}
      onChange={(key) =>
        onChange(
          key === sort.key ? sort : { key, order: DEFAULT_LIST_SORT.order },
        )
      }
      getOrderOptions={getOrderOptions}
      order={sort.order}
      onOrderChange={(order) => onChange({ ...sort, order })}
    />
  );
}

export default ListSortControl;

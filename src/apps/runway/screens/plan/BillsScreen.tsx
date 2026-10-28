import { useState, type CSSProperties } from 'react';
import { Receipt } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import EmptyCard from '@/components/EmptyCard';
import LazyMount from '@/components/LazyMount';
import SearchInput from '@/components/SearchInput';
import SectionHeader from '@/components/SectionHeader';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import ItemChangeControls from '@apps/runway/components/ItemChangeControls';
import BillRow from '@apps/runway/components/BillRow';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import BillForm from '@apps/runway/forms/BillForm';
import {
  selectBills,
  selectBillPayments,
  selectIsMovesLoaded,
  selectIsPlanItemsLoaded,
  selectIsRecordsReady,
  selectStance,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { BillSealed } from '@apps/runway/types';

const SEARCH_THRESHOLD = 8;
const ROWS_PER_CHUNK = 12;
const ESTIMATED_ROW_HEIGHT = 190;

function BillsScreen() {
  const today = todayAsUtcDate(useNow(60_000));
  const isLoaded = useAppSelector(
    (state) =>
      selectIsPlanItemsLoaded(state) &&
      selectIsMovesLoaded(state) &&
      selectIsRecordsReady(state),
  );
  const bills = useAppSelector((state) => selectBills(state, today));
  const payments = useAppSelector((state) => selectBillPayments(state, today));
  const stance = useAppSelector(selectStance);
  const [formKey, setFormKey] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{
    itemId: string;
    payload: BillSealed;
  } | null>(null);

  const hasSearch = bills.length >= SEARCH_THRESHOLD;
  const needle = hasSearch ? query.trim().toLowerCase() : '';
  const visible = bills
    .filter(({ version }) =>
      version.payload.name.toLowerCase().includes(needle),
    )
    .map(({ item, version }) => {
      const payment =
        (payments[item.id] ?? []).find((entry) => entry.dueOn >= today) ?? null;
      return { item, payload: version.payload, payment };
    });

  const getBody = () => {
    if (!isLoaded) {
      return (
        <p className='text-muted-foreground text-sm'>Getting your bills.</p>
      );
    }
    if (bills.length === 0) {
      return (
        <EmptyCard icon={<Receipt className='h-5 w-5' />}>
          A bill has an exact amount and a due date. Add one and it is set aside
          a little at a time from the income days before it is due.
        </EmptyCard>
      );
    }
    return (
      <div className='space-y-3'>
        {hasSearch && (
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder='Search bills'
          />
        )}
        {visible.length === 0 ? (
          <p className='text-muted-foreground text-sm'>No bill matches that.</p>
        ) : (
          <div className='border-border divide-border bg-card divide-y rounded-2xl border'>
            {Array.from(
              { length: Math.ceil(visible.length / ROWS_PER_CHUNK) },
              (_, index) =>
                visible.slice(
                  index * ROWS_PER_CHUNK,
                  (index + 1) * ROWS_PER_CHUNK,
                ),
            ).map((rows, index) => (
              <div
                key={rows[0].item.id}
                className='defer-offscreen'
                style={
                  {
                    '--defer-size': `${rows.length * ESTIMATED_ROW_HEIGHT}px`,
                  } as CSSProperties
                }
              >
                <LazyMount
                  eager={index === 0}
                  estimatedHeight={rows.length * ESTIMATED_ROW_HEIGHT}
                >
                  <ul className='divide-border divide-y'>
                    {rows.map(({ item, payload, payment }) => (
                      <BillRow
                        key={item.id}
                        billId={item.id}
                        bill={payload}
                        payment={payment}
                        planStance={stance}
                        footer={
                          <ItemChangeControls
                            kind='bill'
                            itemId={item.id}
                            current={payload}
                            today={today}
                            name={payload.name}
                            onChange={() =>
                              setEditing({ itemId: item.id, payload })
                            }
                          />
                        }
                      />
                    ))}
                  </ul>
                </LazyMount>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className='space-y-4'>
      <SectionHeader
        title='Bills'
        action={
          <Button
            variant='secondary'
            size='sm'
            onClick={() => setFormKey((current) => (current ?? 0) + 1)}
          >
            + Add bill
          </Button>
        }
      />
      {getBody()}
      {formKey !== null && (
        <BillForm
          key={formKey}
          isOpen
          title='Bill'
          onClose={() => setFormKey(null)}
        />
      )}
      {editing !== null && (
        <BillForm
          key={editing.itemId}
          isOpen
          title='Bill'
          editing={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

export default BillsScreen;

import { useState, type CSSProperties } from 'react';
import { Receipt } from 'lucide-react';

import EmptyCard from '@/components/EmptyCard';
import FloatingAction from '@/components/FloatingAction';
import LazyMount from '@/components/LazyMount';
import SearchInput from '@/components/SearchInput';
import SectionHeader from '@/components/SectionHeader';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { formatDateShortUTC } from '@/utils/formatUtils';
import { PLAN_SEARCH_THRESHOLD } from '@apps/runway/constants';
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

const ROWS_PER_CHUNK = 12;
const ESTIMATED_ROW_HEIGHT = 69;

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

  const hasSearch = bills.length >= PLAN_SEARCH_THRESHOLD;
  const needle = hasSearch ? query.trim().toLowerCase() : '';
  const visible = bills
    .map(({ item, version }) => {
      const payment =
        (payments[item.id] ?? []).find((entry) => entry.dueOn >= today) ?? null;
      return { item, payload: version.payload, payment };
    })
    .filter(({ payload, payment }) =>
      `${payload.name} ${payment ? formatDateShortUTC(payment.dueOn) : ''}`
        .toLowerCase()
        .includes(needle),
    );

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
                        today={today}
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
      />
      {getBody()}
      <FloatingAction
        label='Add a bill'
        icon={<Receipt className='h-5 w-5' aria-hidden='true' />}
        onClick={() => setFormKey((current) => (current ?? 0) + 1)}
      />
      {formKey !== null && (
        <BillForm
          key={formKey}
          isOpen
          title='Bill'
          onClose={() => setFormKey(null)}
        />
      )}
    </div>
  );
}

export default BillsScreen;

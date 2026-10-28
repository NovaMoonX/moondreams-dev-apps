import { useState } from 'react';
import { Receipt } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import EmptyCard from '@/components/EmptyCard';
import SearchInput from '@/components/SearchInput';
import SectionHeader from '@/components/SectionHeader';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import BillRow from '@apps/runway/components/BillRow';
import { LOOKAHEAD_MONTHS } from '@apps/runway/constants';
import { addUtcMonths, todayAsUtcDate } from '@apps/runway/engine/dates';
import { planBillPayments } from '@apps/runway/engine/demands';
import BillForm from '@apps/runway/forms/BillForm';
import {
  selectBills,
  selectComingDays,
  selectIsPlanItemsLoaded,
  selectStance,
} from '@apps/runway/store/selectors/runwaySelectors';

const SEARCH_THRESHOLD = 8;

function BillsScreen() {
  const today = todayAsUtcDate(useNow(60_000));
  const isLoaded = useAppSelector(selectIsPlanItemsLoaded);
  const bills = useAppSelector((state) => selectBills(state, today));
  const comingDays = useAppSelector((state) => selectComingDays(state, today));
  const stance = useAppSelector(selectStance);
  const [formKey, setFormKey] = useState<number | null>(null);
  const [query, setQuery] = useState('');

  const hasSearch = bills.length >= SEARCH_THRESHOLD;
  const needle = hasSearch ? query.trim().toLowerCase() : '';
  const horizon = addUtcMonths(today, LOOKAHEAD_MONTHS);
  const visible = bills
    .filter(({ version }) =>
      version.payload.name.toLowerCase().includes(needle),
    )
    .map(({ item, version }) => {
      const { payload } = version;
      const payments = planBillPayments(
        {
          itemId: item.id,
          createdAt: item.createdAt,
          priority: payload.priority,
          orderIndex: payload.orderIndex,
          amount: payload.amount,
          stanceOverride: payload.stanceOverride ?? null,
          schedule: payload.timing.schedule,
          ending: payload.ending,
          fundedBy: payload.fundedBy,
        },
        comingDays,
        horizon,
        stance,
      );
      const payment = payments.find((entry) => entry.dueOn >= today) ?? null;
      return { item, payload, payment };
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
          <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
            {visible.map(({ item, payload, payment }) => (
              <BillRow
                key={item.id}
                bill={payload}
                payment={payment}
                planStance={stance}
              />
            ))}
          </ul>
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
    </div>
  );
}

export default BillsScreen;

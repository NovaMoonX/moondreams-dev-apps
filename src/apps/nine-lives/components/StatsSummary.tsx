import { useMemo, useState } from 'react';

import { Button, Select } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { shallowEqual } from 'react-redux';

import { useAppSelector } from '@/store';

import {
  makeSelectExpenseTotalsByHousehold,
  selectCatsByHousehold,
  selectLitterBoxesByHousehold,
  selectLitterEntriesByHousehold,
  selectVisitsByHousehold,
} from '../store/selectors';
import { getDaysSince, getLatestFullChangeByBox, LITTER_OVERDUE_DAYS } from '../utils/attentionItems';
import CatPillSelector from './CatPillSelector';
import StatTile from './StatTile';

/** Kept as a plain top-level helper (rather than inline in the component) so `Date.now()` isn't called directly in render. */
function daysSinceNow(timestamp: number) {
  return getDaysSince(timestamp, Date.now());
}

/** Same thresholds as the "needs attention" section, so this stat visually agrees with that section. */
function getLitterStatusClassName(daysSinceChange: number | null): string {
  if (daysSinceChange === null || daysSinceChange >= LITTER_OVERDUE_DAYS) {
    return 'text-destructive';
  }

  if (daysSinceChange >= LITTER_OVERDUE_DAYS - 7) {
    return 'text-warning';
  }

  return '';
}

interface StatsSummaryProps {
  householdId: string;
}

type RecurringView = 'monthly' | 'yearly';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

function StatsSummary({ householdId }: StatsSummaryProps) {
  const [recurringView, setRecurringView] = useState<RecurringView>('monthly');
  const [selectedLitterBoxId, setSelectedLitterBoxId] = useState<string | null>(null);
  const [recurringCatId, setRecurringCatId] = useState<string | null>(null);
  const [lifetimeCatId, setLifetimeCatId] = useState<string>('all');

  const cats = useAppSelector(selectCatsByHousehold(householdId), shallowEqual);
  const visits = useAppSelector(selectVisitsByHousehold(householdId), shallowEqual);
  const litterBoxes = useAppSelector(selectLitterBoxesByHousehold(householdId), shallowEqual);
  const litterEntries = useAppSelector(selectLitterEntriesByHousehold(householdId), shallowEqual);
  const selectRecurringExpenseTotals = useMemo(
    () => makeSelectExpenseTotalsByHousehold(householdId, recurringCatId),
    [householdId, recurringCatId],
  );
  const selectLifetimeExpenseTotals = useMemo(
    () => makeSelectExpenseTotalsByHousehold(householdId, lifetimeCatId === 'all' ? null : lifetimeCatId),
    [householdId, lifetimeCatId],
  );
  const recurringExpenseTotals = useAppSelector(selectRecurringExpenseTotals);
  const lifetimeExpenseTotals = useAppSelector(selectLifetimeExpenseTotals);
  const catOptions = useMemo(
    () => cats.map((cat) => ({ label: cat.name, value: cat.id, photoURL: cat.photoURL })),
    [cats],
  );
  const lifetimeCatOptions = useMemo(
    () => [{ text: 'All cats', value: 'all' }, ...catOptions.map((cat) => ({ text: cat.label, value: cat.value }))],
    [catOptions],
  );
  const completedVisitCount = visits.filter(
    (visit) => visit.status === 'completed',
  ).length;

  const recurringTotal =
    recurringView === 'monthly' ? recurringExpenseTotals.recurringMonthly : recurringExpenseTotals.recurringYearly;

  const activeLitterBoxes = useMemo(() => litterBoxes.filter((box) => box.isActive), [litterBoxes]);

  const latestChangedAtByBox = useMemo(() => getLatestFullChangeByBox(litterEntries), [litterEntries]);

  // The box that's gone longest without a change is the one that most needs attention, so it's the default.
  const mostOverdueBoxId = useMemo(() => {
    let overdueBoxId: string | null = null;
    let overdueChangedAt = Infinity;

    activeLitterBoxes.forEach((box) => {
      const changedAt = latestChangedAtByBox.get(box.id);

      if (changedAt !== undefined && changedAt < overdueChangedAt) {
        overdueChangedAt = changedAt;
        overdueBoxId = box.id;
      }
    });

    return overdueBoxId;
  }, [activeLitterBoxes, latestChangedAtByBox]);

  const selectedLitterBox =
    activeLitterBoxes.find((box) => box.id === (selectedLitterBoxId ?? mostOverdueBoxId)) ?? null;
  const selectedLitterBoxChangedAt = selectedLitterBox
    ? latestChangedAtByBox.get(selectedLitterBox.id) ?? null
    : null;

  return (
    <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
      <StatTile label='Visits so far' value={completedVisitCount} />

      <div className='rounded-lg border border-border bg-card p-4 text-center sm:text-left'>
        <div className='flex items-center justify-center gap-2 sm:justify-between'>
          <p className='text-sm text-muted-foreground'>Recurring expenses</p>
          <div className='flex items-center gap-1 rounded-md border border-border p-0.5'>
            <Button
              type='button'
              variant={recurringView === 'monthly' ? 'primary' : 'secondary'}
              size='sm'
              className={join('h-6 px-2 text-xs', recurringView !== 'monthly' && 'bg-transparent')}
              onClick={() => setRecurringView('monthly')}
            >
              Monthly
            </Button>
            <Button
              type='button'
              variant={recurringView === 'yearly' ? 'primary' : 'secondary'}
              size='sm'
              className={join('h-6 px-2 text-xs', recurringView !== 'yearly' && 'bg-transparent')}
              onClick={() => setRecurringView('yearly')}
            >
              Yearly
            </Button>
          </div>
        </div>
        <p className='mt-2 text-2xl font-semibold'>{currencyFormatter.format(recurringTotal)}</p>
        {catOptions.length > 0 && (
          <div className='mt-3'>
            <CatPillSelector catOptions={catOptions} value={recurringCatId ? [recurringCatId] : []} onValueChange={(value) => setRecurringCatId(value[0] ?? null)} singleSelect />
          </div>
        )}
      </div>

      <div className='rounded-lg border border-border bg-card p-4 text-center sm:text-left'>
        <div className='flex items-center justify-center gap-2 sm:justify-between'>
          <p className='text-sm text-muted-foreground'>Lifetime expenses</p>
        </div>
        <p className='mt-2 text-2xl font-semibold'>{currencyFormatter.format(lifetimeExpenseTotals.lifetime)}</p>
        {catOptions.length > 0 && (
          <div className='mt-3 max-w-40'>
            <Select options={lifetimeCatOptions} value={lifetimeCatId} onChange={setLifetimeCatId} size='sm' />
          </div>
        )}
      </div>

      {selectedLitterBox && (
        <div className='rounded-lg border border-border bg-card p-4 text-center sm:text-left'>
          <div className='flex items-center justify-center gap-2 sm:justify-between'>
            <p className='text-sm text-muted-foreground'>Since litter changed</p>
            {activeLitterBoxes.length > 1 && (
              <div className='max-w-28'>
                <Select
                  options={activeLitterBoxes.map((box) => ({ text: box.name, value: box.id }))}
                  value={selectedLitterBox.id}
                  onChange={setSelectedLitterBoxId}
                  size='sm'
                />
              </div>
            )}
          </div>
          <p
            className={join(
              'mt-2 text-2xl font-semibold',
              getLitterStatusClassName(
                selectedLitterBoxChangedAt === null ? null : daysSinceNow(selectedLitterBoxChangedAt),
              ),
            )}
          >
            {selectedLitterBoxChangedAt === null
              ? 'No changes logged'
              : (() => {
                  const days = daysSinceNow(selectedLitterBoxChangedAt);
                  return days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'}`;
                })()}
          </p>
          {activeLitterBoxes.length === 1 && (
            <p className='mt-1 text-sm text-muted-foreground'>{selectedLitterBox.name}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default StatsSummary;

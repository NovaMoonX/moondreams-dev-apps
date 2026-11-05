import { useState } from 'react';
import { CalendarClock, ChevronDown } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import EmptyCard from '@/components/EmptyCard';
import FloatingAction from '@/components/FloatingAction';
import SearchInput from '@/components/SearchInput';
import SectionHeader from '@/components/SectionHeader';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import HorizonRow from '@apps/runway/components/HorizonRow';
import {
  HORIZON_END_WORDS,
  HORIZON_WORDS,
  RUNWAY_SEARCH_THRESHOLD,
} from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import HorizonForm from '@apps/runway/forms/HorizonForm';
import {
  selectDoneHorizonItems,
  selectHorizonItems,
  selectIsPlanItemsLoaded,
  selectStance,
} from '@apps/runway/store/selectors/runwaySelectors';

function HorizonScreen() {
  const today = todayAsUtcDate(useNow(60_000));
  const isLoaded = useAppSelector(selectIsPlanItemsLoaded);
  const items = useAppSelector((state) => selectHorizonItems(state, today));
  const done = useAppSelector((state) => selectDoneHorizonItems(state, today));
  const stance = useAppSelector(selectStance);
  const [isDoneOpen, setIsDoneOpen] = useState(false);
  const [formKey, setFormKey] = useState<number | null>(null);
  const [query, setQuery] = useState('');

  const hasSearch = items.length >= RUNWAY_SEARCH_THRESHOLD;
  const needle = hasSearch ? query.trim().toLowerCase() : '';
  const matches = ({ version }: (typeof items)[number]) =>
    [version.payload.name, ...version.payload.costs.map(({ name }) => name)]
      .join(' ')
      .toLowerCase()
      .includes(needle);
  const visible = items.filter(matches);
  const doneVisible = done.filter(matches);

  const getBody = () => {
    if (!isLoaded) {
      return (
        <p className='text-muted-foreground text-sm'>{HORIZON_WORDS.loading}</p>
      );
    }
    if (items.length === 0 && done.length === 0) {
      return (
        <EmptyCard icon={<CalendarClock className='h-5 w-5' />}>
          <span className='block font-semibold'>
            {HORIZON_WORDS.emptyTitle}
          </span>
          {HORIZON_WORDS.emptyBody}
        </EmptyCard>
      );
    }
    return (
      <div className='space-y-3'>
        {hasSearch && (
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={HORIZON_WORDS.searchPlaceholder}
          />
        )}
        {items.length === 0 ? null : visible.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            {HORIZON_WORDS.noMatch}
          </p>
        ) : (
          <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
            {visible.map(({ item, version }) => (
              <HorizonRow
                key={item.id}
                itemId={item.id}
                horizon={version.payload}
                today={today}
                stance={stance}
              />
            ))}
          </ul>
        )}
        {doneVisible.length > 0 && (
          <div className='space-y-2'>
            <Button
              type='button'
              variant='tertiary'
              size='sm'
              className='text-muted-foreground! -ml-2 gap-1 font-medium'
              aria-expanded={isDoneOpen}
              onClick={() => setIsDoneOpen(!isDoneOpen)}
            >
              {HORIZON_END_WORDS.doneCaption(doneVisible.length)}
              <ChevronDown
                className={join(
                  'h-4 w-4 transition-transform',
                  isDoneOpen && 'rotate-180',
                )}
                aria-hidden='true'
              />
            </Button>
            {isDoneOpen && (
              <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
                {doneVisible.map(({ item, version }) => (
                  <HorizonRow
                    key={item.id}
                    itemId={item.id}
                    horizon={version.payload}
                    today={today}
                    stance={stance}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className='space-y-4'>
      <SectionHeader title={HORIZON_WORDS.title} />
      {getBody()}
      <FloatingAction
        label={HORIZON_WORDS.addLabel}
        icon={<CalendarClock className='h-5 w-5' aria-hidden='true' />}
        onClick={() => setFormKey((current) => (current ?? 0) + 1)}
      />
      {formKey !== null && (
        <HorizonForm
          key={formKey}
          isOpen
          title={HORIZON_WORDS.formTitle}
          onClose={() => setFormKey(null)}
        />
      )}
    </div>
  );
}

export default HorizonScreen;

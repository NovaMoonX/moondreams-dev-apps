import { useState } from 'react';
import { CalendarClock } from 'lucide-react';

import EmptyCard from '@/components/EmptyCard';
import FloatingAction from '@/components/FloatingAction';
import SearchInput from '@/components/SearchInput';
import SectionHeader from '@/components/SectionHeader';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import HorizonRow from '@apps/runway/components/HorizonRow';
import { HORIZON_WORDS, RUNWAY_SEARCH_THRESHOLD } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import HorizonForm from '@apps/runway/forms/HorizonForm';
import {
  selectHorizonItems,
  selectIsPlanItemsLoaded,
  selectStance,
} from '@apps/runway/store/selectors/runwaySelectors';

function HorizonScreen() {
  const today = todayAsUtcDate(useNow(60_000));
  const isLoaded = useAppSelector(selectIsPlanItemsLoaded);
  const items = useAppSelector((state) => selectHorizonItems(state, today));
  const stance = useAppSelector(selectStance);
  const [formKey, setFormKey] = useState<number | null>(null);
  const [query, setQuery] = useState('');

  const hasSearch = items.length >= RUNWAY_SEARCH_THRESHOLD;
  const needle = hasSearch ? query.trim().toLowerCase() : '';
  const visible = items.filter(({ version }) =>
    [version.payload.name, ...version.payload.costs.map(({ name }) => name)]
      .join(' ')
      .toLowerCase()
      .includes(needle),
  );

  const getBody = () => {
    if (!isLoaded) {
      return (
        <p className='text-muted-foreground text-sm'>{HORIZON_WORDS.loading}</p>
      );
    }
    if (items.length === 0) {
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
        {visible.length === 0 ? (
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

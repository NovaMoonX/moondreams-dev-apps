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
import HorizonSheet from '@apps/runway/screens/plan/HorizonSheet';
import HorizonForm from '@apps/runway/forms/HorizonForm';
import {
  selectAllHorizonItems,
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
  const [openId, setOpenId] = useState<string | null>(null);
  const everything = useAppSelector((state) =>
    selectAllHorizonItems(state, today),
  );
  const [formKey, setFormKey] = useState<number | null>(null);
  const [query, setQuery] = useState('');

  const hasSearch = items.length + done.length >= RUNWAY_SEARCH_THRESHOLD;
  const needle = hasSearch ? query.trim().toLowerCase() : '';
  const matches = ({ version }: (typeof items)[number]) =>
    [version.payload.name, ...version.payload.costs.map(({ name }) => name)]
      .join(' ')
      .toLowerCase()
      .includes(needle);
  const visible = items.filter(matches);
  const doneVisible = done.filter(matches);
  const isDoneShown = isDoneOpen || needle !== '';
  const opened = everything.find(({ item }) => item.id === openId) ?? null;

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
              aria-expanded={isDoneShown}
              onClick={() => setIsDoneOpen(!isDoneOpen)}
            >
              {HORIZON_END_WORDS.doneCaption(doneVisible.length)}
              <ChevronDown
                className={join(
                  'h-4 w-4 transition-transform',
                  isDoneShown && 'rotate-180',
                )}
                aria-hidden='true'
              />
            </Button>
            {isDoneShown && (
              <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
                {doneVisible.map(({ item, version }) => (
                  <HorizonRow
                    key={item.id}
                    onOpenItem={setOpenId}
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
      {opened && (
        <HorizonSheet
          itemId={opened.item.id}
          horizon={opened.version.payload}
          today={today}
          stance={stance}
          onClose={() => setOpenId(null)}
        />
      )}
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

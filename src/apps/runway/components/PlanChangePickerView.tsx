import { useState } from 'react';
import { CalendarClock } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import BackLink from '@/components/BackLink';
import SearchInput from '@/components/SearchInput';
import { useAppSelector } from '@/store';
import { HORIZON_WORDS, RUNWAY_SEARCH_THRESHOLD } from '@apps/runway/constants';
import {
  selectBills,
  selectEnvelopes,
  selectGoals,
  selectResolvedPlan,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { PlanSection } from '@apps/runway/types';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';

interface PlanChangePickerViewProps {
  eventId: string;
  today: number;
  onBack: () => void;
}

/** The items a change can be planned for (pays, bills, envelopes, goals); the one picked opens its change form with this event already chosen as what the change is part of. */
function PlanChangePickerView({
  eventId,
  today,
  onBack,
}: PlanChangePickerViewProps) {
  const { showOnPlan } = useRunwayUrlState();
  const sources = useAppSelector((state) => selectResolvedPlan(state, today));
  const bills = useAppSelector((state) => selectBills(state, today));
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const goals = useAppSelector((state) => selectGoals(state, today));
  const [query, setQuery] = useState('');

  const options: {
    id: string;
    name: string;
    noun: string;
    section: PlanSection;
  }[] = [
    ...sources.flatMap(({ payLines }) =>
      payLines.map(({ item, version }) => ({
        id: item.id,
        name: version.payload.name,
        noun: HORIZON_WORDS.pickPay,
        section: 'income' as const,
      })),
    ),
    ...bills.map(({ item, version }) => ({
      id: item.id,
      name: version.payload.name,
      noun: HORIZON_WORDS.pickBill,
      section: 'bills' as const,
    })),
    ...envelopes.map(({ item, version }) => ({
      id: item.id,
      name: version.payload.name,
      noun: HORIZON_WORDS.pickEnvelope,
      section: 'envelopes' as const,
    })),
    ...goals.map(({ item, version }) => ({
      id: item.id,
      name: version.payload.name,
      noun: HORIZON_WORDS.pickGoal,
      section: 'goals' as const,
    })),
  ];
  const hasSearch = options.length >= RUNWAY_SEARCH_THRESHOLD;
  const needle = hasSearch ? query.trim().toLowerCase() : '';
  const visible = options.filter(({ name }) =>
    name.toLowerCase().includes(needle),
  );

  return (
    <div className='flex flex-1 flex-col gap-4'>
      <div className='flex items-center gap-1'>
        <BackLink isChevronOnly onBack={onBack} />
        <p className='min-w-0 text-2xl font-semibold'>
          {HORIZON_WORDS.planChangeTitle}
        </p>
      </div>
      {hasSearch && (
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={HORIZON_WORDS.planChangeSearch}
        />
      )}
      {options.length === 0 ? (
        <p className='text-muted-foreground text-sm'>
          {HORIZON_WORDS.planChangeNone}
        </p>
      ) : visible.length === 0 ? (
        <p className='text-muted-foreground text-sm'>
          {HORIZON_WORDS.planChangeNoMatch}
        </p>
      ) : (
        <ActionGroup>
          {visible.map(({ id, name, noun, section }) => (
            <ActionRow
              key={id}
              isGrouped
              hasChevron
              icon={<CalendarClock />}
              label={name}
              subtitle={noun}
              onClick={() =>
                void showOnPlan(section, {
                  itemId: id,
                  eventId,
                  returnTo: 'horizon',
                })
              }
            />
          ))}
        </ActionGroup>
      )}
    </div>
  );
}

export default PlanChangePickerView;

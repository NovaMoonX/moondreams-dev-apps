import { useState } from 'react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import BackLink from '@/components/BackLink';
import SearchInput from '@/components/SearchInput';
import SectionDivider from '@/components/SectionDivider';
import { useAppSelector } from '@/store';
import { ActionTitle } from '@apps/runway/components/ActionSection';
import ItemMark from '@apps/runway/components/ItemMark';
import {
  HORIZON_WORDS,
  PICK_KIND_HEADINGS,
  RUNWAY_SEARCH_THRESHOLD,
} from '@apps/runway/constants';
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
    kind: keyof typeof PICK_KIND_HEADINGS;
  }[] = [
    ...sources.flatMap(({ payLines }) =>
      payLines.map(({ item, version }) => ({
        id: item.id,
        name: version.payload.name,
        noun: HORIZON_WORDS.pickPay,
        section: 'income' as const,
        kind: 'income' as const,
      })),
    ),
    ...bills.map(({ item, version }) => ({
      id: item.id,
      name: version.payload.name,
      noun: HORIZON_WORDS.pickBill,
      section: 'bills' as const,
      kind: 'bill' as const,
    })),
    ...envelopes.map(({ item, version }) => ({
      id: item.id,
      name: version.payload.name,
      noun: HORIZON_WORDS.pickEnvelope,
      section: 'envelopes' as const,
      kind: 'envelope' as const,
    })),
    ...goals.map(({ item, version }) => ({
      id: item.id,
      name: version.payload.name,
      noun: HORIZON_WORDS.pickGoal,
      section: 'goals' as const,
      kind: 'goal' as const,
    })),
  ];
  const hasSearch = options.length >= RUNWAY_SEARCH_THRESHOLD;
  const needle = hasSearch ? query.trim().toLowerCase() : '';
  const visible = options.filter(({ name }) =>
    name.toLowerCase().includes(needle),
  );

  return (
    <div className='flex flex-1 flex-col gap-4'>
      <BackLink onBack={onBack} />
      <ActionTitle>{HORIZON_WORDS.planChangeTitle}</ActionTitle>
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
        (
          Object.keys(PICK_KIND_HEADINGS) as (keyof typeof PICK_KIND_HEADINGS)[]
        ).map((kind) => {
          const group = visible.filter((option) => option.kind === kind);
          return group.length === 0 ? null : (
            <div key={kind} className='space-y-2'>
              <SectionDivider label={PICK_KIND_HEADINGS[kind]} />
              <ActionGroup>
                {group.map(({ id, name, noun, section }) => (
                  <ActionRow
                    key={id}
                    isGrouped
                    hasChevron
                    icon={<ItemMark itemId={id} name={name} />}
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
            </div>
          );
        })
      )}
    </div>
  );
}

export default PlanChangePickerView;

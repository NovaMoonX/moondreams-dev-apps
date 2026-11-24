import { useState } from 'react';

import FormSheet from '@/components/FormSheet';
import SearchInput from '@/components/SearchInput';
import { useAppSelector } from '@/store';
import ItemRow from '@apps/runway/components/ItemRow';
import {
  NEEDS_HOME_WORDS,
  RUNWAY_SEARCH_THRESHOLD,
} from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  selectEnvelopes,
  selectItemLooks,
} from '@apps/runway/store/selectors/runwaySelectors';
import {
  describePickEffect,
  describeRunsOut,
} from '@apps/runway/utils/purchaseText';

interface EnvelopePickSheetProps {
  subtitle: string;
  /** What sending the purchase to each envelope does to it, shown on its row. */
  effectOf?: (envelopeId: string) => {
    leftCents: number;
    afterCents: number;
    spillTo: (string | null)[];
  };
  onPick: (envelopeId: string) => void;
  onClose: () => void;
}

/** Every envelope, searchable once the list is long, each one tap from being picked. */
function EnvelopePickSheet({
  subtitle,
  effectOf,
  onPick,
  onClose,
}: EnvelopePickSheetProps) {
  const today = todayAsUtcDate();
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const looks = useAppSelector(selectItemLooks);
  const [query, setQuery] = useState('');
  const shown = envelopes.filter(({ item }) =>
    (looks.get(item.id)?.name ?? '')
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  return (
    <FormSheet
      isOpen
      isDrawerWhenShort
      onClose={onClose}
      title={NEEDS_HOME_WORDS.bulkPickTitle}
    >
      <div className='space-y-3 pb-4'>
        <p className='text-muted-foreground text-sm'>{subtitle}</p>
        {envelopes.length >= RUNWAY_SEARCH_THRESHOLD && (
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={NEEDS_HOME_WORDS.bulkSearch}
          />
        )}
        {envelopes.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            {NEEDS_HOME_WORDS.bulkNoEnvelopes}
          </p>
        ) : shown.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            {NEEDS_HOME_WORDS.bulkNoMatch}
          </p>
        ) : (
          <ul className='border-border divide-border bg-card max-h-[max(9rem,calc(92dvh-29rem))] divide-y overflow-y-auto rounded-2xl border'>
            {shown.map(({ item }) => {
              const name = looks.get(item.id)?.name ?? item.id;
              const effect = effectOf ? effectOf(item.id) : null;
              const lead = effect ? describePickEffect(effect) : null;
              return (
                <ItemRow
                  key={item.id}
                  name={name}
                  emoji={looks.get(item.id)?.emoji ?? null}
                  detailLead={lead}
                  detail={
                    effect
                      ? describeRunsOut(effect.spillTo, (id) =>
                          looks.get(id)?.name ?? 'An envelope',
                        )
                      : null
                  }
                  isPrivate={lead !== null}
                  ariaLabel={lead ? `${name}, ${lead.text}` : name}
                  hiddenAriaLabel={name}
                  isAction
                  onOpen={() => onPick(item.id)}
                />
              );
            })}
          </ul>
        )}
      </div>
    </FormSheet>
  );
}

export default EnvelopePickSheet;

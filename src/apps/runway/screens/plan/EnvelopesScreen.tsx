import { useState } from 'react';
import { Mail } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import EmptyCard from '@/components/EmptyCard';
import SearchInput from '@/components/SearchInput';
import SectionHeader from '@/components/SectionHeader';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import EnvelopeForm from '@apps/runway/forms/EnvelopeForm';
import {
  selectEnvelopes,
  selectPairedBy,
  selectIsPlanItemsLoaded,
  selectIsMovesLoaded,
  selectIsRecordsReady,
} from '@apps/runway/store/selectors/runwaySelectors';
import { describePairedBy } from '@apps/runway/utils/fundingText';
import EnvelopeTile from '@apps/runway/components/EnvelopeTile';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';

const SEARCH_THRESHOLD = 8;

function EnvelopesScreen() {
  const today = todayAsUtcDate(useNow(60_000));
  const balances = useAppSelector(selectBalances);
  const isLoaded = useAppSelector(
    (state) =>
      selectIsPlanItemsLoaded(state) &&
      selectIsMovesLoaded(state) &&
      selectIsRecordsReady(state),
  );
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const pairedBy = useAppSelector((state) => selectPairedBy(state, today));
  const [formKey, setFormKey] = useState<number | null>(null);
  const [query, setQuery] = useState('');

  const hasSearch = envelopes.length >= SEARCH_THRESHOLD;
  const needle = hasSearch ? query.trim().toLowerCase() : '';
  const visible = envelopes.filter(({ version }) =>
    version.payload.name.toLowerCase().includes(needle),
  );

  const getBody = () => {
    if (!isLoaded) {
      return (
        <p className='text-muted-foreground text-sm'>Getting your envelopes.</p>
      );
    }
    if (envelopes.length === 0) {
      return (
        <EmptyCard icon={<Mail className='h-5 w-5' />}>
          An envelope is spending with no due date, like groceries or gas. Add
          one and say how often it gets money.
        </EmptyCard>
      );
    }
    return (
      <div className='space-y-3'>
        {hasSearch && (
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder='Search envelopes'
          />
        )}
        {visible.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            No envelope matches that.
          </p>
        ) : (
          <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
            {visible.map(({ item, version }) => (
              <EnvelopeTile
                key={item.id}
                itemId={item.id}
                envelope={version.payload}
                cents={balances.assignedByItem[item.id] ?? 0}
                pairedNote={describePairedBy(pairedBy[item.id] ?? [])}
                today={today}
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
        title='Envelopes'
        action={
          <Button
            variant='secondary'
            size='sm'
            onClick={() => setFormKey((current) => (current ?? 0) + 1)}
          >
            Add an envelope
          </Button>
        }
      />
      {getBody()}
      {formKey !== null && (
        <EnvelopeForm
          key={formKey}
          isOpen
          title='Envelope'
          onClose={() => setFormKey(null)}
        />
      )}
    </div>
  );
}

export default EnvelopesScreen;

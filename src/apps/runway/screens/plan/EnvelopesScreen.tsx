import { useState } from 'react';
import { Mail } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import EmptyCard from '@/components/EmptyCard';
import SearchInput from '@/components/SearchInput';
import SectionHeader from '@/components/SectionHeader';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import ItemBadge from '@apps/runway/components/ItemBadge';
import PriorityBadge from '@apps/runway/components/PriorityBadge';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import EnvelopeForm from '@apps/runway/forms/EnvelopeForm';
import {
  selectEnvelopes,
  selectIsPlanItemsLoaded,
} from '@apps/runway/store/selectors/runwaySelectors';
import { describeFunding } from '@apps/runway/utils/fundingText';

const SEARCH_THRESHOLD = 8;

function EnvelopesScreen() {
  const today = todayAsUtcDate(useNow(60_000));
  const isLoaded = useAppSelector(selectIsPlanItemsLoaded);
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
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
              <li key={item.id} className='flex items-start gap-3 p-3'>
                <ItemBadge
                  name={version.payload.name}
                  emoji={version.payload.emoji}
                />
                <div className='min-h-10 min-w-0 flex-1'>
                  <p className='line-clamp-2 font-medium break-words'>
                    {version.payload.name}
                  </p>
                  <p className='text-muted-foreground text-sm'>
                    {describeFunding(version.payload.funding)}
                  </p>
                </div>
                <div className='flex h-10 items-center'>
                  <PriorityBadge priority={version.payload.priority} />
                </div>
              </li>
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
            + New envelope
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

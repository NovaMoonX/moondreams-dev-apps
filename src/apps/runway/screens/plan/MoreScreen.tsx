import { ChevronRight } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import SectionHeader from '@/components/SectionHeader';
import {
  MORE_ENTRIES,
  MORE_ENTRY_HELP,
  MORE_ENTRY_LABELS,
  PLAN_MORE_LABEL,
} from '@apps/runway/constants';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';

/** The places Plan reaches that are not a list of the plan's items; an entry is listed once the screen behind it exists. */
function MoreScreen() {
  const { openMoreEntry } = useRunwayUrlState();

  return (
    <div className='space-y-4'>
      <SectionHeader title={PLAN_MORE_LABEL} />
      <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
        {MORE_ENTRIES.map((entry) => (
          <li key={entry}>
            <Button
              type='button'
              variant='tertiary'
              className='h-auto min-h-14 w-full items-start justify-between gap-3 rounded-none p-3 text-left font-normal whitespace-normal first:rounded-t-2xl last:rounded-b-2xl'
              onClick={() => openMoreEntry(entry)}
            >
              <span className='min-w-0 flex-1'>
                <span className='block font-medium'>
                  {MORE_ENTRY_LABELS[entry]}
                </span>
                <span className='text-muted-foreground block text-sm'>
                  {MORE_ENTRY_HELP[entry]}
                </span>
              </span>
              <ChevronRight
                className='text-muted-foreground mt-1 h-4 w-4 shrink-0'
                aria-hidden='true'
              />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default MoreScreen;

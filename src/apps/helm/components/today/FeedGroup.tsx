import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronDown, Layers } from 'lucide-react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import { SyncedTaskRow } from '@apps/helm/components/today/SyncedCard';
import { HELM_COPY } from '@apps/helm/constants';
import type { SyncedRecord } from '@apps/helm/types';

interface FeedGroupProps {
  /** The group's category label, such as "Planned meals". */
  label: string;
  appName: string;
  records: SyncedRecord[];
  onOpen: (record: SyncedRecord) => void;
}

/** Another app's all-day feed for the day as one quiet row that opens in place, so a long feed never pushes the day's appointments down. */
function FeedGroup({ label, appName, records, onOpen }: FeedGroupProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className='helm-card overflow-hidden'>
      <Button
        type='button'
        variant='tertiary'
        aria-expanded={isOpen}
        className='flex h-auto min-h-14 w-full items-center justify-start gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2'
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className='bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg'>
          <Layers className='size-[55%]' aria-hidden='true' />
        </span>
        <span className='min-w-0 flex-1'>
          <span className='text-foreground block text-[15px] leading-[21px] break-words'>
            {HELM_COPY.feedGroupTitle(label, records.length)}
          </span>
          <span className='text-muted-foreground block text-[13px] break-words'>
            {HELM_COPY.feedGroupDetail(appName)}
          </span>
        </span>
        <ChevronDown
          className={join(
            'text-muted-foreground size-4 shrink-0',
            isOpen && 'rotate-180',
          )}
          aria-hidden='true'
        />
      </Button>
      {isOpen && (
        <ul className='divide-border border-border divide-y border-t'>
          {records.map((record) => (
            <li key={record.id}>
              <SyncedTaskRow record={record} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default FeedGroup;

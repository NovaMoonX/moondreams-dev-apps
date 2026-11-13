import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { ChevronRight, Clock } from 'lucide-react';

import DetailSheet from '@/components/DetailSheet';
import { formatTime } from '@/utils/formatUtils';
import { HELM_COPY } from '@apps/helm/constants';
import {
  getOutboxWords,
  removeFromOutbox,
  type OutboxEntry,
} from '@apps/helm/store/actions/outboxActions';

interface OutboxItemProps {
  entry: OutboxEntry;
  onRemove: (entry: OutboxEntry) => void;
}

/** A thing saved on this device: its words only in the session that typed them, otherwise why they are hidden; its typed time; Remove. */
function OutboxItem({ entry, onRemove }: OutboxItemProps) {
  const words = getOutboxWords(entry.id);
  return (
    <li className='flex items-center gap-3 px-4 py-3'>
      <span className='min-w-0 flex-1'>
        <span className='text-foreground line-clamp-3 text-[15px] leading-[21px] break-words'>
          {words === null ? HELM_COPY.outboxRowTitle : `“${words}”`}
        </span>
        <span className='text-muted-foreground block text-[13px] tabular-nums'>
          {HELM_COPY.outboxRowLine(formatTime(entry.createdAt))}
        </span>
      </span>
      <Button
        type='button'
        variant='tertiary'
        size='sm'
        className="relative before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-['']"
        onClick={() => onRemove(entry)}
      >
        {HELM_COPY.outboxRemove}
      </Button>
    </li>
  );
}

interface OutboxSummaryProps {
  uid: string | null;
  entries: OutboxEntry[];
}

/** One thin row above the field with how many things this device holds unsent; it opens a sheet listing each. Nothing when there are none. */
function OutboxSummary({ uid, entries }: OutboxSummaryProps) {
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);

  if (entries.length === 0) return null;

  const remove = async (entry: OutboxEntry) => {
    if (!uid) return;
    const isConfirmed = await confirm({
      title: HELM_COPY.outboxRemoveTitle,
      message: HELM_COPY.outboxRemoveBody(
        getOutboxWords(entry.id),
        formatTime(entry.createdAt),
      ),
      confirmText: HELM_COPY.outboxRemove,
      destructive: true,
    });
    if (!isConfirmed) return;
    await removeFromOutbox(uid, entry.id).catch((error: unknown) => {
      console.error('Helm could not remove a saved thing', error);
      addToast({ title: HELM_COPY.outboxRemoveFailed, type: 'error' });
    });
  };

  return (
    <>
      <Button
        type='button'
        variant='tertiary'
        className='flex h-auto w-full items-center gap-2 px-1 py-2 text-left'
        onClick={() => setIsOpen(true)}
      >
        <Clock
          className='text-muted-foreground size-4 shrink-0'
          aria-hidden='true'
        />
        <span className='text-muted-foreground min-w-0 flex-1 text-[13px]'>
          {HELM_COPY.outboxCount(entries.length)}
        </span>
        <ChevronRight
          className='text-muted-foreground size-4 shrink-0'
          aria-hidden='true'
        />
      </Button>
      <DetailSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={HELM_COPY.outboxSheetTitle}
      >
        <ul className='helm-card divide-border divide-y overflow-hidden'>
          {entries.map((entry) => (
            <OutboxItem
              key={entry.id}
              entry={entry}
              onRemove={(picked) => void remove(picked)}
            />
          ))}
        </ul>
      </DetailSheet>
    </>
  );
}

export default OutboxSummary;

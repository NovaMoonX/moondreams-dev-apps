import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight } from 'lucide-react';

import type { Inquiry } from '@apps/going-once/types';
import {
  formatSentAt,
  getInquirerName,
  isPrefilledMessage,
} from '@apps/going-once/utils/inquiries';

interface InquiryRowProps {
  inquiry: Inquiry;
  thing: string;
  handledBy: string | null;
  now: number;
  onOpen: () => void;
}

/** An inquiry in the Inbox: the person's name (bold while New), a quiet line of the thing and the time, then the message when the buyer wrote one of their own. */
function InquiryRow({
  inquiry,
  thing,
  handledBy,
  now,
  onOpen,
}: InquiryRowProps) {
  const isNew = inquiry.status === 'NEW';
  const line = [
    handledBy === null ? null : `Handled by ${handledBy}`,
    thing,
    formatSentAt(
      isNew ? inquiry.lastSentAt : (inquiry.handledAt ?? inquiry.lastSentAt),
      now,
    ),
    inquiry.sendCount > 1 ? `Sent ${inquiry.sendCount} times` : null,
  ]
    .filter((part) => part !== null)
    .join(' · ');
  const message = isPrefilledMessage(inquiry) ? null : inquiry.message;

  return (
    <Button
      type='button'
      variant='tertiary'
      className='border-border bg-card h-auto min-h-16 w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left'
      onClick={onOpen}
    >
      <span className='min-w-0 flex-1'>
        <span
          className={join(
            'text-foreground block truncate text-base',
            isNew ? 'font-semibold' : 'font-normal',
          )}
        >
          {getInquirerName(inquiry)}
        </span>
        <span className='text-muted-foreground mt-0.5 line-clamp-2 text-sm font-normal break-words'>
          {line}
        </span>
        {message !== null && message !== '' && (
          <span className='text-foreground mt-1 line-clamp-2 text-sm font-normal break-words'>
            {message}
          </span>
        )}
      </span>
      <ChevronRight
        className='text-muted-foreground size-5 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

export default InquiryRow;

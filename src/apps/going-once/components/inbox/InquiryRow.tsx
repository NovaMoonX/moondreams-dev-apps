import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import type { Inquiry } from '@apps/going-once/types';
import {
  formatSentAt,
  getInquirerName,
} from '@apps/going-once/utils/inquiries';

interface InquiryRowProps {
  inquiry: Inquiry;
  /** The thing it is about, already worded ("Gray sofa (Pending)"). */
  thing: string;
  /** Who handled it, for a Handled row. */
  handledBy: string | null;
  now: number;
  onOpen: () => void;
}

/** An inquiry in the Inbox: the person's name (bold while New), then the time, the thing and the start of the message. */
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
    formatSentAt(
      isNew ? inquiry.lastSentAt : (inquiry.handledAt ?? inquiry.lastSentAt),
      now,
    ),
    thing,
    inquiry.sendCount > 1 ? `Sent ${inquiry.sendCount} times` : null,
    inquiry.message,
  ]
    .filter((part) => part !== null && part !== '')
    .join(' · ');

  return (
    <Button
      type='button'
      variant='tertiary'
      className='border-border bg-card h-auto min-h-16 w-full items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-left'
      onClick={onOpen}
    >
      <span className='min-w-0 flex-1'>
        <span
          className={join(
            'text-foreground block truncate text-base',
            isNew ? 'font-semibold' : 'font-medium',
          )}
        >
          {getInquirerName(inquiry)}
        </span>
        <span className='text-muted-foreground mt-0.5 line-clamp-2 text-sm font-normal break-words'>
          {line}
        </span>
      </span>
    </Button>
  );
}

export default InquiryRow;

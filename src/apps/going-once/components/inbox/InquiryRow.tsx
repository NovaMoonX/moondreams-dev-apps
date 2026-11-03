import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight } from 'lucide-react';

import ThingThumb from '@apps/going-once/components/things/ThingThumb';
import { formatDateShort } from '@/utils/formatUtils';
import type { Inquiry, Item } from '@apps/going-once/types';
import {
  formatSentAt,
  getInquirerName,
  isPrefilledMessage,
} from '@apps/going-once/utils/inquiries';

interface InquiryRowProps {
  inquiry: Inquiry;
  /** The thing it is about, for its cover; `null` once it is gone. */
  item: Item | null;
  thing: string;
  handledBy: string | null;
  now: number;
  onOpen: () => void;
}

/** An inquiry in the Inbox: the thing's cover, the person's name (bold while New), a quiet line of the thing and the time, then the message when the buyer wrote one of their own. */
function InquiryRow({
  inquiry,
  item,
  thing,
  handledBy,
  now,
  onOpen,
}: InquiryRowProps) {
  const isNew = inquiry.status === 'NEW';
  const line = [
    handledBy === null ? null : `Handled by ${handledBy}`,
    inquiry.contactClearedAt === null ? thing : null,
    formatSentAt(
      isNew ? inquiry.lastSentAt : (inquiry.handledAt ?? inquiry.lastSentAt),
      now,
    ),
    inquiry.sendCount > 1 ? `Sent ${inquiry.sendCount} times` : null,
    inquiry.contactClearedAt === null
      ? null
      : `Details cleared ${formatDateShort(inquiry.contactClearedAt)}`,
  ]
    .filter((part) => part !== null)
    .join(' · ');
  const message = isPrefilledMessage(inquiry) ? null : inquiry.message;

  return (
    <Button
      type='button'
      variant='tertiary'
      className='border-border bg-card h-auto min-h-16 w-full items-center justify-between gap-3 rounded-2xl border px-3 py-3 text-left'
      onClick={onOpen}
    >
      <ThingThumb item={item} className='size-10 self-start' />
      <span className='min-w-0 flex-1'>
        <span
          className={join(
            'text-foreground block truncate text-base',
            isNew ? 'font-semibold' : 'font-normal',
          )}
        >
          {getInquirerName(inquiry, thing)}
        </span>
        <span className='text-muted-foreground mt-0.5 line-clamp-2 text-sm font-normal text-pretty break-words'>
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

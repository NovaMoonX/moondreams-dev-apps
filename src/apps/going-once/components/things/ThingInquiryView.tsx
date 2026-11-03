import { Button } from '@moondreamsdev/dreamer-ui/components';

import BackLink from '@/components/BackLink';
import StatusViewFooter from '@apps/going-once/components/things/StatusViewFooter';
import type { Inquiry, Item } from '@apps/going-once/types';
import { getItemName } from '@apps/going-once/utils/listing';
import {
  formatSentAt,
  getInquirerName,
} from '@apps/going-once/utils/inquiries';

interface ThingInquiryViewProps {
  item: Item;
  inquiry: Inquiry;
  now: number;
  /** Whether the thing can be held now: Available and ready for buyers. */
  canHold: boolean;
  footerNode: HTMLElement | null;
  onBack: () => void;
  onHold: () => void;
}

const getNote = (item: Item, inquiry: Inquiry, canHold: boolean) => {
  if (item.pending?.inquiryId === inquiry.id)
    return `Held for ${getInquirerName(inquiry)}`;
  if (canHold) return null;
  return item.status === 'PENDING'
    ? 'Someone is already picking this up'
    : 'This thing is not up for a hold right now';
};

/** One person's message about this thing, with the way to hold it for them. */
function ThingInquiryView({
  item,
  inquiry,
  now,
  canHold,
  footerNode,
  onBack,
  onHold,
}: ThingInquiryViewProps) {
  const name = getInquirerName(inquiry);

  return (
    <div className='space-y-4'>
      <div className='space-y-2'>
        <BackLink onBack={onBack} label={getItemName(item)} />
        <p className='text-lg font-semibold break-words'>{name} asked</p>
        <p className='text-muted-foreground text-sm'>
          {formatSentAt(inquiry.createdAt, now)}
          {inquiry.sendCount > 1 && ` · Sent ${inquiry.sendCount} times`}
        </p>
      </div>
      <p className='text-sm break-words whitespace-pre-wrap'>
        {inquiry.message ?? 'No message.'}
      </p>
      <StatusViewFooter
        footerNode={footerNode}
        note={getNote(item, inquiry, canHold)}
        onDone={onBack}
      >
        {canHold && (
          <Button
            type='button'
            size='lg'
            rounded='full'
            className='w-full'
            onClick={onHold}
          >
            <span className='truncate'>
              Hold {getItemName(item)} for {name}
            </span>
          </Button>
        )}
      </StatusViewFooter>
    </div>
  );
}

export default ThingInquiryView;

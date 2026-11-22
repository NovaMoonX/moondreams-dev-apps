import { useState } from 'react';

import { Filter } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import FormSheet from '@/components/FormSheet';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { formatDateOrdinal } from '@/utils/formatUtils';
import EmailFilterSheet from '@apps/runway/components/EmailFilterSheet';
import {
  EMAIL_WORDS,
  describeEmailOutcome,
} from '@apps/runway/components/emailWords';
import { MaskedText } from '@apps/runway/components/MaskedText';
import type { EmailEventRead } from '@apps/runway/hooks/useEmailPurchases';

interface EmailEventSheetProps {
  event: EmailEventRead;
  onClose: () => void;
}

/** One email that reached the address: what it said, what became of it and, unless it was already filtered out, a way to filter out more like it. */
function EmailEventSheet({ event, onClose }: EmailEventSheetProps) {
  const [isFiltering, setIsFiltering] = useState(false);

  if (isFiltering) {
    return (
      <EmailFilterSheet event={event} onClose={() => setIsFiltering(false)} />
    );
  }

  return (
    <FormSheet
      isOpen
      isDrawerWhenShort
      onClose={onClose}
      title={EMAIL_WORDS.emailTitle}
      actions={<ValuesEyeButton />}
    >
      <div className='space-y-4 pb-4'>
        <div>
          <p className='text-lg font-semibold break-words'>
            <MaskedText>{event.subject || EMAIL_WORDS.noSubject}</MaskedText>
          </p>
          <p className='text-muted-foreground text-sm break-words'>
            {describeEmailOutcome(event.outcome)} ·{' '}
            {formatDateOrdinal(event.receivedAt)}
          </p>
          <p className='text-muted-foreground text-sm break-all'>
            {EMAIL_WORDS.from} {event.from}
          </p>
        </div>
        {event.snippet && (
          <p className='text-muted-foreground line-clamp-6 text-sm break-words'>
            <MaskedText>{event.snippet}</MaskedText>
          </p>
        )}
        {(event.outcome === 'unread' || event.outcome === 'notPurchase') && (
          <p className='text-muted-foreground text-sm'>
            {event.outcome === 'unread'
              ? EMAIL_WORDS.unreadLine
              : EMAIL_WORDS.notPurchaseLine}
          </p>
        )}
        {event.outcome !== 'filtered' && (
          <ActionGroup isRoomy>
            <ActionRow
              isGrouped
              isRoomy
              hasChevron
              icon={<Filter />}
              label={EMAIL_WORDS.filterOut}
              onClick={() => setIsFiltering(true)}
            />
          </ActionGroup>
        )}
      </div>
    </FormSheet>
  );
}

export default EmailEventSheet;

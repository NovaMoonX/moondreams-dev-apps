import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import {
  CircleSlash,
  Filter,
  Info,
  MailCheck,
  Receipt,
  ShoppingBag,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import FormSheet from '@/components/FormSheet';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useAppSelector } from '@/store';
import { formatDateOrdinal } from '@/utils/formatUtils';
import EmailFilterSheet from '@apps/runway/components/EmailFilterSheet';
import {
  EMAIL_WORDS,
  describeEmailOutcome,
} from '@apps/runway/components/emailWords';
import { MaskedText } from '@apps/runway/components/MaskedText';
import { selectPurchaseIds } from '@apps/runway/store/selectors/emailSelectors';
import type { EmailEventRead } from '@apps/runway/hooks/useEmailPurchases';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import type { EmailOutcome } from '@apps/runway/types';

const OUTCOME_ICONS: Record<EmailOutcome, LucideIcon> = {
  purchase: ShoppingBag,
  filtered: Filter,
  confirm: MailCheck,
  unread: Info,
  notPurchase: CircleSlash,
  notTracking: CircleSlash,
};

interface EmailEventSheetProps {
  event: EmailEventRead;
  onClose: () => void;
}

/** One email that reached the address: what it said, what became of it and, unless it was already filtered out, a way to filter out more like it. */
function EmailEventSheet({ event, onClose }: EmailEventSheetProps) {
  const [isFiltering, setIsFiltering] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const { closeMoreEntry, showTab, openPurchase } = useRunwayUrlState();
  const purchaseIds = useAppSelector(selectPurchaseIds);

  if (isFiltering) {
    return (
      <EmailFilterSheet event={event} onClose={() => setIsFiltering(false)} />
    );
  }

  const OutcomeIcon = OUTCOME_ICONS[event.outcome];
  const isLong = event.snippet.length > 240;
  const hasPurchase =
    event.purchaseId !== null && purchaseIds.has(event.purchaseId);

  return (
    <FormSheet
      isOpen
      isDrawerWhenShort
      onClose={onClose}
      title={EMAIL_WORDS.emailTitle}
      actions={<ValuesEyeButton />}
    >
      <div className='space-y-4 pb-4'>
        <dl className='border-border bg-card grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-2xl border p-4 text-sm'>
          <dt className='text-muted-foreground'>{EMAIL_WORDS.from}</dt>
          <dd className='min-w-0 break-words'>{event.from}</dd>
          <dt className='text-muted-foreground'>{EMAIL_WORDS.subject}</dt>
          <dd className='min-w-0 font-medium break-words'>
            <MaskedText>{event.subject || EMAIL_WORDS.noSubject}</MaskedText>
          </dd>
          <dt className='text-muted-foreground'>{EMAIL_WORDS.received}</dt>
          <dd className='min-w-0 break-words'>
            {formatDateOrdinal(event.receivedAt)}
          </dd>
        </dl>
        <div className='space-y-1'>
          <p className='flex items-start gap-2 text-sm font-medium'>
            <OutcomeIcon
              className='text-muted-foreground mt-0.5 h-4 w-4 shrink-0'
              aria-hidden='true'
            />
            <span className='min-w-0 break-words'>
              {describeEmailOutcome(event.outcome)}
              {event.readBy === 'ai' && (
                <>
                  <Sparkles
                    className='text-muted-foreground ml-1.5 inline h-3.5 w-3.5 align-[-2px]'
                    aria-hidden='true'
                  />
                  <span className='sr-only'>{EMAIL_WORDS.readByAi}</span>
                </>
              )}
            </span>
          </p>
          {(event.outcome === 'unread' || event.outcome === 'notPurchase') && (
            <p className='text-muted-foreground pl-6 text-sm'>
              {event.outcome === 'unread'
                ? EMAIL_WORDS.unreadLine
                : EMAIL_WORDS.notPurchaseLine}
            </p>
          )}
        </div>
        {event.snippet && (
          <div className='space-y-1'>
            <blockquote className='border-border bg-muted/60 border-l-4 px-3 py-2 text-sm'>
              <p
                className={join(
                  'break-words whitespace-pre-line',
                  isLong && !isExpanded && 'line-clamp-6',
                )}
              >
                <MaskedText>{event.snippet}</MaskedText>
              </p>
            </blockquote>
            {isLong && (
              <Button
                variant='tertiary'
                size='sm'
                aria-expanded={isExpanded}
                onClick={() => setIsExpanded((current) => !current)}
              >
                {isExpanded ? EMAIL_WORDS.showLess : EMAIL_WORDS.showMore}
              </Button>
            )}
          </div>
        )}
        {(hasPurchase || event.outcome !== 'filtered') && (
          <ActionGroup isRoomy>
            {hasPurchase && (
              <ActionRow
                isGrouped
                isRoomy
                hasChevron
                icon={<Receipt />}
                label={EMAIL_WORDS.openPurchase}
                onClick={async () => {
                  const { purchaseId } = event;
                  if (purchaseId === null) return;
                  onClose();
                  closeMoreEntry();
                  await showTab('spend');
                  openPurchase(purchaseId);
                }}
              />
            )}
            {event.outcome !== 'filtered' && (
              <ActionRow
                isGrouped
                isRoomy
                hasChevron
                icon={<Filter />}
                label={EMAIL_WORDS.filterOut}
                onClick={() => setIsFiltering(true)}
              />
            )}
          </ActionGroup>
        )}
      </div>
    </FormSheet>
  );
}

export default EmailEventSheet;

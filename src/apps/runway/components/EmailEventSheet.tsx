import { useState } from 'react';

import {
  CircleSlash,
  FileText,
  Filter,
  Info,
  LoaderCircle,
  MailCheck,
  PlusCircle,
  Receipt,
  ShoppingBag,
  PackageX,
  type LucideIcon,
  Undo2,
} from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import FormSheet from '@/components/FormSheet';
import Subview from '@/components/Subview';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useCanSeeDebugDetails } from '@/lib/debugProfiles/useCanSeeDebugDetails';
import { useAppSelector } from '@/store';
import { formatDateOrdinal } from '@/utils/formatUtils';
import EmailFilterSheet from '@apps/runway/components/EmailFilterSheet';
import {
  EMAIL_WORDS,
  describeEmailOutcome,
  stripForwardPrefix,
} from '@apps/runway/components/emailWords';
import { MaskedText } from '@apps/runway/components/MaskedText';
import { selectPurchaseIds } from '@apps/runway/store/selectors/emailSelectors';
import {
  useEmailActions,
  type EmailEventRead,
} from '@apps/runway/hooks/useEmailPurchases';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import type { EmailOutcome } from '@apps/runway/types';

const ADDABLE_OUTCOMES: EmailOutcome[] = ['notPurchase', 'unread'];

const PLAIN_FAILURE_CODES = [
  'functions/failed-precondition',
  'functions/not-found',
];

const readAddFailure = (error: unknown) =>
  PLAIN_FAILURE_CODES.includes((error as { code?: string })?.code ?? '')
    ? (error as Error).message
    : EMAIL_WORDS.addAsPurchaseFailed;

const OUTCOME_ICONS: Record<EmailOutcome, LucideIcon> = {
  purchase: ShoppingBag,
  filtered: Filter,
  confirm: MailCheck,
  unread: Info,
  notPurchase: CircleSlash,
  notTracking: CircleSlash,
  refund: Undo2,
  cancel: PackageX,
};

function EmailHeader({ event }: { event: EmailEventRead }) {
  const canSeeDebug = useCanSeeDebugDetails();
  const readMs =
    event.savedAt === null
      ? null
      : Math.max(0, event.savedAt - event.receivedAt);
  return (
    <dl className='border-border bg-card grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-2xl border p-4 text-sm'>
      <dt className='text-muted-foreground'>{EMAIL_WORDS.from}</dt>
      <dd className='min-w-0 break-words'>{event.from}</dd>
      <dt className='text-muted-foreground'>{EMAIL_WORDS.subject}</dt>
      <dd className='min-w-0 font-medium break-words'>
        <MaskedText>
          {stripForwardPrefix(event.subject) || EMAIL_WORDS.noSubject}
        </MaskedText>
      </dd>
      <dt className='text-muted-foreground'>{EMAIL_WORDS.received}</dt>
      <dd className='min-w-0 break-words'>
        {formatDateOrdinal(event.receivedAt)}
      </dd>
      {canSeeDebug && readMs !== null && (
        <>
          <dt className='text-muted-foreground'>{EMAIL_WORDS.readIn}</dt>
          <dd className='min-w-0'>
            {EMAIL_WORDS.readTook(Math.round(readMs / 1000))}
          </dd>
        </>
      )}
    </dl>
  );
}

interface EmailEventSheetProps {
  event: EmailEventRead;
  onClose: () => void;
}

/** One email that reached the address: what it said, what became of it and, unless it was already filtered out, a way to filter out more like it. */
function EmailEventSheet({ event, onClose }: EmailEventSheetProps) {
  const [isFiltering, setIsFiltering] = useState(false);
  const [isWholeShown, setIsWholeShown] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [addFailure, setAddFailure] = useState<string | null>(null);
  const actions = useEmailActions();
  const { closeMoreEntry, showTab, openPurchase } = useRunwayUrlState();
  const purchaseIds = useAppSelector(selectPurchaseIds);

  if (isFiltering) {
    return (
      <EmailFilterSheet event={event} onClose={() => setIsFiltering(false)} />
    );
  }

  if (isWholeShown && event.bodyText !== null) {
    return (
      <Subview
        overlay
        title={EMAIL_WORDS.emailTitle}
        onClose={() => setIsWholeShown(false)}
        headerAction={<ValuesEyeButton />}
      >
        <div className='space-y-4'>
          <EmailHeader event={event} />
          <p className='text-sm break-words whitespace-pre-line'>
            <MaskedText>{event.bodyText}</MaskedText>
          </p>
        </div>
      </Subview>
    );
  }

  const OutcomeIcon = OUTCOME_ICONS[event.outcome];
  const hasWholeEmail =
    event.bodyText !== null &&
    (event.bodyText.replace(/\n\s*\n/g, '\n').trim() !== event.snippet.trim() ||
      event.snippet.length > 280);
  const hasPurchase =
    event.purchaseId !== null && purchaseIds.has(event.purchaseId);
  const canAdd =
    ADDABLE_OUTCOMES.includes(event.outcome) && event.purchaseId === null;

  const addAsPurchase = () => {
    if (isAdding) return;
    setIsAdding(true);
    setAddFailure(null);
    actions.addAsPurchase(event.id).catch((error: unknown) => {
      setAddFailure(readAddFailure(error));
      setIsAdding(false);
    });
  };

  return (
    <FormSheet
      isOpen
      isDrawerWhenShort
      onClose={onClose}
      title={EMAIL_WORDS.emailTitle}
      actions={<ValuesEyeButton />}
    >
      <div className='space-y-4 pb-4'>
        <EmailHeader event={event} />
        <div className='space-y-1'>
          <p className='flex items-start gap-2 text-sm font-medium'>
            <OutcomeIcon
              className='text-muted-foreground mt-0.5 h-4 w-4 shrink-0'
              aria-hidden='true'
            />
            <span className='min-w-0 break-words'>
              {describeEmailOutcome(event.outcome)}
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
          <blockquote className='border-border bg-muted/60 border-l-4 px-3 py-2 text-sm'>
            <p className='line-clamp-6 break-words whitespace-pre-line'>
              <MaskedText>{event.snippet}</MaskedText>
            </p>
          </blockquote>
        )}
        {addFailure !== null && canAdd && (
          <p className='text-destructive text-sm' role='alert'>
            {addFailure}
          </p>
        )}
        {(hasPurchase || hasWholeEmail || event.outcome !== 'filtered') && (
          <ActionGroup isRoomy>
            {canAdd && (
              <ActionRow
                isGrouped
                isRoomy
                icon={<PlusCircle />}
                label={EMAIL_WORDS.addAsPurchase}
                subtitle={
                  isAdding
                    ? EMAIL_WORDS.addingAsPurchase
                    : EMAIL_WORDS.addAsPurchaseSub
                }
                trailing={
                  isAdding ? (
                    <LoaderCircle
                      className='h-4 w-4 animate-spin motion-reduce:[animation-duration:2.5s]'
                      aria-hidden='true'
                    />
                  ) : undefined
                }
                onClick={addAsPurchase}
              />
            )}
            {hasWholeEmail && (
              <ActionRow
                isGrouped
                isRoomy
                hasChevron
                icon={<FileText />}
                label={EMAIL_WORDS.showWholeEmail}
                onClick={() => setIsWholeShown(true)}
              />
            )}
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

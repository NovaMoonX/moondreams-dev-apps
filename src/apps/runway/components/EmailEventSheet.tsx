import { useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

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
import DebugDetails from '@/components/DebugDetails';
import FormSheet from '@/components/FormSheet';
import InlineNotice from '@/components/InlineNotice';
import Subview from '@/components/Subview';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useSteadyBusy } from '@/hooks/useSteadyBusy';
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

// These carry a sentence written for the person; anything else is a crash and gets the plain retry line.
const PLAIN_FAILURE_CODES = [
  'functions/failed-precondition',
  'functions/not-found',
  'functions/unavailable',
  'functions/permission-denied',
  'functions/resource-exhausted',
];

interface AddFailure {
  line: string;
  raw: string;
  code: string | null;
}

const readAddFailure = (error: unknown): AddFailure => {
  const code = (error as { code?: string })?.code ?? null;
  const raw = error instanceof Error ? error.message : String(error);
  return {
    line: PLAIN_FAILURE_CODES.includes(code ?? '')
      ? raw
      : EMAIL_WORDS.addAsPurchaseFailed,
    raw,
    code,
  };
};

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
  const [addFailure, setAddFailure] = useState<AddFailure | null>(null);
  const actions = useEmailActions();
  const { closeMoreEntry, showTab, openPurchase } = useRunwayUrlState();
  const purchaseIds = useAppSelector(selectPurchaseIds);
  const { addToast } = useToast();
  const isAddShown = useSteadyBusy(isAdding) || isAdding;

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
  const isPurchaseRemoved =
    event.outcome === 'purchase' && event.purchaseRemovedAt !== null;
  const canAdd =
    (ADDABLE_OUTCOMES.includes(event.outcome) && event.purchaseId === null) ||
    isPurchaseRemoved;

  const addAsPurchase = () => {
    if (isAdding) return;
    setIsAdding(true);
    setAddFailure(null);
    actions
      .addAsPurchase(event.id)
      .then(() =>
        addToast({ title: EMAIL_WORDS.addedAsPurchase, type: 'success' }),
      )
      .catch((error: unknown) => setAddFailure(readAddFailure(error)))
      .finally(() => setIsAdding(false));
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
              {isPurchaseRemoved
                ? EMAIL_WORDS.purchaseRemoved
                : describeEmailOutcome(event.outcome)}
            </span>
          </p>
          {(event.outcome === 'unread' ||
            event.outcome === 'notPurchase' ||
            isPurchaseRemoved) && (
            <p className='text-muted-foreground pl-6 text-sm'>
              {isPurchaseRemoved
                ? EMAIL_WORDS.purchaseRemovedLine
                : event.outcome === 'unread'
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
          <div role='alert'>
            <InlineNotice tone='warning'>{addFailure.line}</InlineNotice>
            <DebugDetails
              className='mt-2'
              message={addFailure.raw}
              facts={[
                `Code: ${addFailure.code ?? 'none'}`,
                `Outcome: ${event.outcome}`,
              ]}
            />
          </div>
        )}
        {(hasPurchase || hasWholeEmail || event.outcome !== 'filtered') && (
          <ActionGroup isRoomy>
            {canAdd && (
              <ActionRow
                isGrouped
                isRoomy
                icon={
                  isAddShown ? (
                    <LoaderCircle className='animate-spin motion-reduce:[animation-duration:2.5s]' />
                  ) : (
                    <PlusCircle />
                  )
                }
                label={EMAIL_WORDS.addAsPurchase}
                subtitle={
                  isAddShown
                    ? EMAIL_WORDS.addingAsPurchase
                    : EMAIL_WORDS.addAsPurchaseSub
                }
                isDisabled={isAddShown}
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

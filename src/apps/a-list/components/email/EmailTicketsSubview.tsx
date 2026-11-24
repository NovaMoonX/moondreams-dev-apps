import { useEffect, useState } from 'react';

import { KeyRound, Mail } from 'lucide-react';
import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import EmailConfirmNotice from '@/components/emailForwarding/EmailConfirmNotice';
import EmailForwardingStatusLine from '@/components/emailForwarding/EmailForwardingStatusLine';
import { EMAIL_FORWARDING_WORDS as WORDS } from '@/components/emailForwarding/emailForwardingWords';
import EmailSetupView from '@/components/emailForwarding/EmailSetupView';
import SectionDivider from '@/components/SectionDivider';
import SearchInput from '@/components/SearchInput';
import Subview from '@/components/Subview';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import {
  hasConfirmNotice,
  shortenForwardingAddress,
} from '@/lib/emailForwarding/address';
import type { EmailConfirm } from '@/lib/emailForwarding/types';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateTime } from '@/utils/formatUtils';
import EmailEventSheet from '@apps/a-list/components/email/EmailEventSheet';
import {
  EMAIL_ADDRESS_PREFIX,
  EMAIL_EVENT_KEEP_DAYS,
  EMAIL_SETUP_LINE,
  EMAIL_TICKETS_SHORT_TITLE,
} from '@apps/a-list/constants';
import {
  markEmailChangesSeen,
  rotateEmailAddress,
} from '@apps/a-list/store/actions/emailActions';
import {
  selectEmailEvents,
  selectEmailIntake,
  selectEmailLoadError,
  selectEmailProgress,
  selectIsEmailLoaded,
} from '@apps/a-list/store/selectors';
import {
  describeEmailEvent,
  EMAIL_OUTCOME_EMOJIS,
  getUnseenChanges,
} from '@apps/a-list/utils/emailEvents';
import type { AListEmailEvent } from '@apps/a-list/types';

const EVENTS_SHOWN = 5;
const KEPT_LINE = `Emails are kept here for ${EMAIL_EVENT_KEEP_DAYS} days.`;
const CONFIRM_TAPPED_KEY = 'a-list:email-confirm-tapped';
const CONFIRM_NOTICE_DAYS = 7;
const DAY_MS = 86_400_000;

const readConfirmTapped = (confirmAt: number | null) => {
  try {
    return (
      confirmAt !== null &&
      localStorage.getItem(CONFIRM_TAPPED_KEY) === String(confirmAt)
    );
  } catch {
    return false;
  }
};

const writeConfirmTapped = (confirmAt: number) => {
  try {
    localStorage.setItem(CONFIRM_TAPPED_KEY, String(confirmAt));
  } catch {
    // The notice folds for this visit only.
  }
};

interface EmailRowsProps {
  events: AListEmailEvent[];
  onOpen: (eventId: string) => void;
}

function EmailRows({ events, onOpen }: EmailRowsProps) {
  const viewings = useAppSelector((state) => state.aList.viewings.items);
  const getZone = (viewingId: string | null) =>
    viewings.find((entry) => entry.id === viewingId)?.theatre?.timeZone ?? null;

  return (
    <ActionGroup>
      {events.map((event) => (
        <ActionRow
          key={event.id}
          isGrouped
          hasChevron
          icon={EMAIL_OUTCOME_EMOJIS[event.outcome]}
          label={describeEmailEvent(event, getZone(event.viewingId))}
          subtitle={formatDateTime(event.receivedAt)}
          onClick={() => onOpen(event.id)}
        />
      ))}
    </ActionGroup>
  );
}

interface AllEmailsProps extends EmailRowsProps {
  onClose: () => void;
}

function AllEmailsOverlay({ events, onOpen, onClose }: AllEmailsProps) {
  const viewings = useAppSelector((state) => state.aList.viewings.items);
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const shown = events.filter(
    (event) =>
      needle === '' ||
      describeEmailEvent(
        event,
        viewings.find((entry) => entry.id === event.viewingId)?.theatre
          ?.timeZone ?? null,
      )
        .toLowerCase()
        .includes(needle) ||
      (event.theatreName ?? '').toLowerCase().includes(needle),
  );

  return (
    <Subview overlay title='Recent emails' onClose={onClose}>
      <div className='space-y-3'>
        <SearchInput
          placeholder='Search your emails'
          value={query}
          onChange={setQuery}
        />
        {shown.length === 0 ? (
          <p className='text-muted-foreground text-sm'>No emails match that.</p>
        ) : (
          <EmailRows events={shown} onOpen={onOpen} />
        )}
        <p className='text-muted-foreground text-xs'>{KEPT_LINE}</p>
      </div>
    </Subview>
  );
}

interface EmailTicketsSubviewProps {
  onClose: () => void;
}

interface BodyProps extends EmailTicketsSubviewProps {
  uid: string;
}

function EmailTicketsBody({ uid, onClose }: BodyProps) {
  const intake = useAppSelector(selectEmailIntake);
  const progress = useAppSelector(selectEmailProgress);
  const events = useAppSelector(selectEmailEvents);
  const loadError = useAppSelector(selectEmailLoadError);
  const { confirm } = useActionModal();
  const now = useNow(60_000);
  const [isReopened, setIsReopened] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [confirmTappedAt, setConfirmTappedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const [isAllOpen, setIsAllOpen] = useState(false);

  const isSetupShown = isReopened || hasStarted || intake === null;
  const openEvent = events.find((entry) => entry.id === openEventId) ?? null;
  const shownEvents = events.slice(0, EVENTS_SHOWN);
  const newestUnseen =
    getUnseenChanges(events, progress?.noticeSeenThrough ?? null)[0]
      ?.receivedAt ?? null;
  const pendingConfirm: EmailConfirm | null =
    intake?.confirmAt == null
      ? null
      : {
          url: intake.confirmUrl,
          code: intake.confirmCode,
          at: intake.confirmAt,
          autoConfirm: intake.autoConfirm ?? null,
          provider: intake.confirmProvider ?? null,
        };
  const confirmAt = pendingConfirm?.at ?? null;
  const isConfirmTappedBefore = readConfirmTapped(confirmAt);
  const getIsConfirmShown = (shown: EmailConfirm) =>
    shown.autoConfirm === 'confirmed'
      ? !events.some(
          (entry) => entry.outcome !== 'confirm' && entry.receivedAt > shown.at,
        )
      : now < shown.at + CONFIRM_NOTICE_DAYS * DAY_MS;
  const shownConfirm =
    pendingConfirm !== null &&
    hasConfirmNotice(pendingConfirm) &&
    getIsConfirmShown(pendingConfirm)
      ? pendingConfirm
      : null;

  useEffect(() => {
    if (isSetupShown || newestUnseen === null) return;
    markEmailChangesSeen(uid, newestUnseen).catch(() => undefined);
  }, [isSetupShown, newestUnseen, uid]);

  const getNewAddress = async () => {
    if (intake !== null) {
      const isAccepted = await confirm({
        title: WORDS.newAddressTitle,
        message: WORDS.newAddressMessage,
        confirmText: WORDS.newAddress,
        destructive: true,
      });
      if (!isAccepted) return;
    } else {
      setHasStarted(true);
    }
    setIsBusy(true);
    setError(null);
    try {
      await rotateEmailAddress();
    } catch (rotateError) {
      setError(getErrorMessage(rotateError, WORDS.addressFailed));
    } finally {
      setIsBusy(false);
    }
  };

  const backToStatus = () => {
    setIsReopened(false);
    setHasStarted(false);
    setError(null);
  };

  return (
    <>
      <Subview
        title={EMAIL_TICKETS_SHORT_TITLE}
        onClose={onClose}
        onBack={
          (isReopened || hasStarted) && intake !== null
            ? backToStatus
            : undefined
        }
      >
        {isSetupShown ? (
          <EmailSetupView
            setupLine={EMAIL_SETUP_LINE}
            prefix={EMAIL_ADDRESS_PREFIX}
            address={intake?.address ?? null}
            isLoading={false}
            isFailed={loadError !== null}
            isBusy={isBusy}
            error={error}
            onGetAddress={() => void getNewAddress()}
            onRetry={() => window.location.reload()}
            onDone={backToStatus}
          />
        ) : (
          <div className='space-y-6'>
            {shownConfirm !== null && (
              <EmailConfirmNotice
                appName='A-List'
                confirm={shownConfirm}
                isTapped={
                  isConfirmTappedBefore || confirmTappedAt === shownConfirm.at
                }
                onConfirmTapped={() => {
                  writeConfirmTapped(shownConfirm.at);
                  setConfirmTappedAt(shownConfirm.at);
                }}
              />
            )}
            <EmailForwardingStatusLine lastReceivedAt={intake.lastReceivedAt} />
            <div className='space-y-3'>
              <SectionDivider label='📨 Recent emails' />
              {events.length === 0 ? (
                <p className='text-muted-foreground text-sm'>
                  {intake.lastReceivedAt === null
                    ? 'Nothing yet. Forward your latest AMC booking to see it land here.'
                    : `Nothing in the last ${EMAIL_EVENT_KEEP_DAYS} days.`}
                </p>
              ) : (
                <>
                  <EmailRows events={shownEvents} onOpen={setOpenEventId} />
                  {events.length > EVENTS_SHOWN && (
                    <Button
                      type='button'
                      variant='tertiary'
                      size='sm'
                      rounded='full'
                      className='text-muted-foreground! mx-auto flex'
                      onClick={() => setIsAllOpen(true)}
                    >
                      See all {events.length}
                    </Button>
                  )}
                  <p className='text-muted-foreground text-xs'>{KEPT_LINE}</p>
                </>
              )}
            </div>
            {loadError !== null && (
              <p className='text-destructive text-sm' role='alert'>
                Couldn’t load your emails. Try again in a moment.
              </p>
            )}
            {error && (
              <p className='text-destructive text-sm' role='alert'>
                {error}
              </p>
            )}
            <div className='space-y-2'>
              <ActionRow
                icon={<Mail />}
                label={WORDS.addressRow}
                subtitle={shortenForwardingAddress(
                  intake.address,
                  EMAIL_ADDRESS_PREFIX,
                )}
                hasChevron
                onClick={() => setIsReopened(true)}
              />
              <ActionRow
                isDestructive
                icon={<KeyRound />}
                label={WORDS.newAddress}
                subtitle={WORDS.newAddressSub}
                isDisabled={isBusy}
                onClick={() => void getNewAddress()}
              />
            </div>
          </div>
        )}
      </Subview>
      {isAllOpen && (
        <AllEmailsOverlay
          events={events}
          onOpen={setOpenEventId}
          onClose={() => setIsAllOpen(false)}
        />
      )}
      {openEvent && (
        <EmailEventSheet
          event={openEvent}
          onClose={() => setOpenEventId(null)}
        />
      )}
    </>
  );
}

/** Where the member gets the address to forward AMC's ticket emails to, and comes back to see what each email did. */
function EmailTicketsSubview({ onClose }: EmailTicketsSubviewProps) {
  const { user } = useAuth();
  const isLoaded = useAppSelector(selectIsEmailLoaded);
  const loadError = useAppSelector(selectEmailLoadError);

  return user && isLoaded ? (
    <EmailTicketsBody uid={user.uid} onClose={onClose} />
  ) : (
    <Subview title={EMAIL_TICKETS_SHORT_TITLE} onClose={onClose}>
      {loadError !== null ? (
        <p className='text-destructive text-sm' role='alert'>
          Couldn’t load your emails. Try again in a moment.
        </p>
      ) : (
        <p className='text-muted-foreground text-sm' role='status'>
          Loading…
        </p>
      )}
    </Subview>
  );
}

export default EmailTicketsSubview;

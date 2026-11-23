import { useEffect, useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import EmailAddressRow from '@/components/emailForwarding/EmailAddressRow';
import EmailForwardingStatusLine from '@/components/emailForwarding/EmailForwardingStatusLine';
import EmailSetupAgainRows from '@/components/emailForwarding/EmailSetupAgainRows';
import EmailSetupWalkthrough from '@/components/emailForwarding/EmailSetupWalkthrough';
import SectionDivider from '@/components/SectionDivider';
import SearchInput from '@/components/SearchInput';
import Subview from '@/components/Subview';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateTime } from '@/utils/formatUtils';
import EmailEventSheet from '@apps/a-list/components/email/EmailEventSheet';
import {
  EMAIL_EVENT_KEEP_DAYS,
  EMAIL_TICKETS_SHORT_TITLE,
  EMAIL_TICKETS_WORDS,
} from '@apps/a-list/constants';
import {
  finishEmailSetup,
  markEmailChangesSeen,
  restartEmailSetup,
  rotateEmailAddress,
  saveEmailProgress,
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
  getWalkStartedAt,
  hasUsefulEmailSince,
} from '@apps/a-list/utils/emailEvents';
import type { AListEmailEvent } from '@apps/a-list/types';

const EVENTS_SHOWN = 5;
const KEPT_LINE = `Emails are kept here for ${EMAIL_EVENT_KEEP_DAYS} days.`;

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
  const isFinishWritten = useRef(false);
  // Stays in the walk until the member presses Done, even once setup is written as done on its own.
  const [isWalking, setIsWalking] = useState(progress?.doneAt == null);
  const [isReopened, setIsReopened] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const [isAllOpen, setIsAllOpen] = useState(false);

  const isTestReceived = hasUsefulEmailSince(
    events,
    progress?.startedAt ?? null,
  );
  const openEvent = events.find((entry) => entry.id === openEventId) ?? null;
  const shownEvents = events.slice(0, EVENTS_SHOWN);
  const newestUnseen =
    getUnseenChanges(events, progress?.noticeSeenThrough ?? null)[0]
      ?.receivedAt ?? null;
  const hasStrayEmail = events.some(
    (entry) =>
      entry.outcome === 'notTicket' &&
      !/(^|[@.])amctheatres\.com$/.test(entry.from),
  );

  useEffect(() => {
    if (progress?.doneAt != null || !isTestReceived || isFinishWritten.current)
      return;
    isFinishWritten.current = true;
    finishEmailSetup(uid).catch(() => {
      isFinishWritten.current = false;
    });
  }, [progress?.doneAt, isTestReceived, uid]);

  useEffect(() => {
    if (isWalking || newestUnseen === null) return;
    markEmailChangesSeen(uid, newestUnseen).catch(() => undefined);
  }, [isWalking, newestUnseen, uid]);

  const fail = (failure: unknown, fallback: string) =>
    setError(getErrorMessage(failure, fallback));

  const setUpAgain = async () => {
    setError(null);
    try {
      await restartEmailSetup(uid, getWalkStartedAt(intake, events));
      isFinishWritten.current = false;
      setIsReopened(true);
      setIsWalking(true);
    } catch (restartError) {
      fail(restartError, 'Couldn’t start over. Try again in a moment.');
    }
  };

  const backToStatus = () => {
    finishEmailSetup(uid)
      .then(() => {
        setIsReopened(false);
        setIsWalking(false);
      })
      .catch((finishError: unknown) =>
        fail(finishError, 'Couldn’t save that. Try again in a moment.'),
      );
  };

  const finish = () => {
    setIsReopened(false);
    setIsWalking(false);
    finishEmailSetup(uid).catch(() => undefined);
  };

  return (
    <>
      {isWalking ? (
        <EmailSetupWalkthrough
          words={EMAIL_TICKETS_WORDS}
          intake={intake}
          isTestReceived={isTestReceived}
          progress={progress}
          hasStrayEmail={hasStrayEmail}
          onSaveProgress={(next) =>
            saveEmailProgress(uid, next, getWalkStartedAt(intake, events))
          }
          onGetAddress={async () => {
            await rotateEmailAddress();
          }}
          onFinish={finish}
          onFinishLater={onClose}
          onBackToStatus={isReopened ? backToStatus : null}
          title={EMAIL_TICKETS_SHORT_TITLE}
        />
      ) : (
        <Subview title={EMAIL_TICKETS_SHORT_TITLE} onClose={onClose}>
          <div className='space-y-6'>
            <EmailForwardingStatusLine
              lastReceivedAt={intake?.lastReceivedAt ?? null}
            />
            <div className='space-y-3'>
              <SectionDivider label='📨 Recent emails' />
              {events.length === 0 ? (
                <p className='text-muted-foreground text-sm'>
                  {intake?.lastReceivedAt == null
                    ? 'Nothing has reached your address yet.'
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
            {intake !== null && <EmailAddressRow address={intake.address} />}
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
            <EmailSetupAgainRows
              onSetUpAgain={() => void setUpAgain()}
              onGetNewAddress={async () => {
                await rotateEmailAddress();
              }}
              onFailed={setError}
            />
          </div>
        </Subview>
      )}
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

/** Where the member sets up forwarding AMC's ticket emails, one step at a time, and comes back to see what each email did. */
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

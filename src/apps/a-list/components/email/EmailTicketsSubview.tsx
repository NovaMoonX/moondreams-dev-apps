import { useEffect, useRef, useState } from 'react';

import { Sparkles } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import EmailAddressRow from '@/components/emailForwarding/EmailAddressRow';
import EmailForwardingStatusLine from '@/components/emailForwarding/EmailForwardingStatusLine';
import EmailSetupAgainRows from '@/components/emailForwarding/EmailSetupAgainRows';
import EmailSetupWalkthrough from '@/components/emailForwarding/EmailSetupWalkthrough';
import SectionDivider from '@/components/SectionDivider';
import ShowMoreButton from '@/components/ShowMoreButton';
import Subview from '@/components/Subview';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateTime } from '@/utils/formatUtils';
import EmailEventSheet from '@apps/a-list/components/email/EmailEventSheet';
import {
  EMAIL_TICKETS_TITLE,
  EMAIL_TICKETS_WORDS,
} from '@apps/a-list/constants';
import {
  finishEmailSetup,
  restartEmailSetup,
  rotateEmailAddress,
  saveEmailProgress,
} from '@apps/a-list/store/actions/emailActions';
import {
  selectEmailEvents,
  selectEmailIntake,
  selectEmailProgress,
  selectIsEmailLoaded,
} from '@apps/a-list/store/selectors';
import {
  describeEmailEvent,
  EMAIL_OUTCOME_EMOJIS,
  getWalkStartedAt,
  hasUsefulEmailSince,
} from '@apps/a-list/utils/emailEvents';

const EVENTS_SHOWN = 8;

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
  const viewings = useAppSelector((state) => state.aList.viewings.items);
  const isFinishWritten = useRef(false);
  // Stays in the walk until the member presses Done, even once setup is written as done on its own.
  const [isWalking, setIsWalking] = useState(progress?.doneAt == null);
  const [isReopened, setIsReopened] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const [isAllShown, setIsAllShown] = useState(false);

  const isTestReceived = hasUsefulEmailSince(
    events,
    progress?.startedAt ?? null,
  );
  const openEvent = events.find((entry) => entry.id === openEventId) ?? null;
  const shownEvents = isAllShown ? events : events.slice(0, EVENTS_SHOWN);
  const hasStrayEmail = events.some(
    (entry) =>
      entry.outcome === 'notTicket' && !entry.from.endsWith('amctheatres.com'),
  );

  useEffect(() => {
    if (progress?.doneAt != null || !isTestReceived || isFinishWritten.current)
      return;
    isFinishWritten.current = true;
    finishEmailSetup(uid).catch(() => {
      isFinishWritten.current = false;
    });
  }, [progress?.doneAt, isTestReceived, uid]);

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

  const getZone = (viewingId: string | null) =>
    viewings.find((entry) => entry.id === viewingId)?.theatre?.timeZone ?? null;

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
          title={EMAIL_TICKETS_TITLE}
        />
      ) : (
        <Subview title={EMAIL_TICKETS_TITLE} isTitleWrapped onClose={onClose}>
          <div className='space-y-6'>
            <EmailForwardingStatusLine
              lastReceivedAt={intake?.lastReceivedAt ?? null}
            />
            <div className='space-y-3'>
              <SectionDivider label='📨 Recent emails' />
              {events.length === 0 ? (
                <p className='text-muted-foreground text-sm'>
                  Nothing has reached your address yet.
                </p>
              ) : (
                <>
                  <ActionGroup>
                    {shownEvents.map((event) => (
                      <ActionRow
                        key={event.id}
                        isGrouped
                        isRoomy
                        hasChevron
                        icon={EMAIL_OUTCOME_EMOJIS[event.outcome]}
                        label={describeEmailEvent(
                          event,
                          getZone(event.viewingId),
                        )}
                        subtitle={formatDateTime(event.receivedAt)}
                        trailing={
                          event.readBy === 'ai' && (
                            <>
                              <Sparkles
                                className='text-muted-foreground size-3.5'
                                aria-hidden='true'
                              />
                              <span className='sr-only'>Read with AI</span>
                            </>
                          )
                        }
                        onClick={() => setOpenEventId(event.id)}
                      />
                    ))}
                  </ActionGroup>
                  {events.length > EVENTS_SHOWN && (
                    <ShowMoreButton
                      isOpen={isAllShown}
                      onClick={() => setIsAllShown((current) => !current)}
                    >
                      {isAllShown
                        ? 'Show fewer'
                        : `Show ${events.length - EVENTS_SHOWN} more`}
                    </ShowMoreButton>
                  )}
                </>
              )}
            </div>
            {intake !== null && <EmailAddressRow address={intake.address} />}
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

  return user && isLoaded ? (
    <EmailTicketsBody uid={user.uid} onClose={onClose} />
  ) : (
    <Subview title={EMAIL_TICKETS_TITLE} isTitleWrapped onClose={onClose}>
      <p className='text-muted-foreground text-sm' role='status'>
        Loading…
      </p>
    </Subview>
  );
}

export default EmailTicketsSubview;

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { CalendarDays, ChevronRight } from 'lucide-react';

import { useConnections } from '@/lib/connections/useConnections';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useGoogleConnect } from '@apps/helm/hooks/useGoogleConnect';
import { foldCalendarOffer } from '@apps/helm/store/actions/settingsActions';

interface CalendarRowProps {
  title: string;
  reason: string;
  onOpen: () => void;
}

function CalendarRow({ title, reason, onOpen }: CalendarRowProps) {
  return (
    <Button
      type='button'
      variant='tertiary'
      className='flex h-auto min-h-14 w-full items-center justify-start gap-3 px-4 py-3 text-left'
      onClick={onOpen}
    >
      <CalendarDays
        className='text-muted-foreground size-5 shrink-0'
        aria-hidden='true'
      />
      <span className='min-w-0 flex-1'>
        <span className='text-foreground block text-[15px] leading-[21px] break-words'>
          {title}
        </span>
        <span className='text-muted-foreground block text-[13px] text-pretty break-words'>
          {reason}
        </span>
      </span>
      <ChevronRight
        className='text-muted-foreground size-4 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

/** Today's one quiet way to a calendar: an offer until the person folds it, and a Reconnect row for each account Google stopped sharing. Never shown before the connections and profile have loaded. */
function ConnectCalendarRow() {
  const name = useAssistantName();
  const { user } = useAuth();
  const { begin } = useGoogleConnect();
  const { grants, isKnown } = useConnections({ readerAppId: 'helm' });
  const profile = useAppSelector((state) => state.helm.profile);
  const calendars = grants.filter(
    (grant) => grant.connectorId === 'google:calendar',
  );
  const stopped = calendars.filter(
    (grant) => grant.status === 'needsReconnect',
  );

  if (!isKnown || !profile) return null;

  if (stopped.length > 0)
    return (
      <div className='space-y-2'>
        {stopped.map((grant) => (
          <div key={grant.id} className='helm-card overflow-hidden'>
            <CalendarRow
              title={HELM_COPY.calendarReconnectTitle}
              reason={HELM_COPY.calendarReconnectReason}
              onOpen={() => begin({ accountId: grant.accountId })}
            />
          </div>
        ))}
      </div>
    );

  if (calendars.length > 0 || profile.calendarOfferFoldedAt !== null)
    return null;

  return (
    <div className='helm-card overflow-hidden'>
      <CalendarRow
        title={HELM_COPY.calendarOfferTitle}
        reason={HELM_COPY.calendarOfferReason(name)}
        onOpen={() => begin()}
      />
      <div className='flex justify-end px-2 pb-2'>
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          onClick={() => {
            if (user)
              foldCalendarOffer(user.uid).catch((error: unknown) =>
                console.error('Helm calendar offer was not folded', error),
              );
          }}
        >
          {HELM_COPY.calendarOfferNotNow}
        </Button>
      </div>
    </div>
  );
}

export default ConnectCalendarRow;

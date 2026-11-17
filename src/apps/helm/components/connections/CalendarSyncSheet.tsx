import { useRef, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { Button } from '@moondreamsdev/dreamer-ui/components';

import FormSheet from '@/components/FormSheet';
import InlineNotice from '@/components/InlineNotice';
import LockedButton from '@/components/LockedButton';
import MethodPicker from '@/components/MethodPicker';
import ModalFooterActions from '@/components/ModalFooterActions';
import { readConnectorOptions } from '@/lib/connections/connectionCalls';
import type { ConnectorOption } from '@/lib/connections/contract';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useAppSelector } from '@/store';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useGoogleConnect } from '@apps/helm/hooks/useGoogleConnect';
import {
  readNeededScope,
  setHelmCalendarSync,
  type SetHelmCalendarSyncRequest,
} from '@apps/helm/queries/calendarSyncCalls';

type View = 'start' | 'pick' | 'stop';

interface CalendarSyncSheetProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
}

const isWritable = (option: ConnectorOption) => option.isWritable === true;

function SyncForm({
  onClose,
  accountId,
}: Omit<CalendarSyncSheetProps, 'isOpen'>) {
  const name = useAssistantName();
  const isOffline = useNetworkStatus() === 'offline';
  const { begin, requestCalendarScopes } = useGoogleConnect();
  const sync = useAppSelector((state) => state.helm.profile?.calendarSync);
  const isOnHere = !!sync && sync.accountId === accountId;
  const isGone = isOnHere && sync.lastError === 'calendarGone';
  const needsReconnect = isOnHere && sync.lastError === 'reconnect';
  const [view, setView] = useState<View>(
    isOnHere && !isGone ? 'stop' : 'start',
  );
  const [isWorking, setIsWorking] = useState(false);
  const inFlight = useRef(false);
  const [failure, setFailure] = useState<string | null>(null);

  const calendars = useQuery({
    queryKey: ['helm', 'calendarOptions', accountId],
    queryFn: () =>
      readConnectorOptions({ connectorId: 'google:calendar', accountId }),
    enabled: view === 'pick',
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const writable = (calendars.data ?? [])
    .filter(isWritable)
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));

  const run = async (request: SetHelmCalendarSyncRequest) => {
    if (isWorking || inFlight.current) return;
    inFlight.current = true;
    setIsWorking(true);
    setFailure(null);
    try {
      try {
        await setHelmCalendarSync(request);
      } catch (error) {
        const scope = readNeededScope(error, request);
        if (scope === null) throw error;
        const outcome = await requestCalendarScopes(accountId, [scope]).catch(
          (consentError: unknown) => {
            console.error('Helm calendar consent did not finish', consentError);
            return 'cancelled' as const;
          },
        );
        if (outcome === 'redirected') return;
        if (outcome === 'cancelled') {
          setFailure(HELM_COPY.calendarSyncCancelled);
          setIsWorking(false);
          inFlight.current = false;
          return;
        }
        await setHelmCalendarSync(request);
      }
      onClose();
    } catch (error) {
      console.error('Helm calendar sync did not change', error);
      const code = (error as { code?: string } | null)?.code;
      setFailure(
        request.action === 'stop'
          ? HELM_COPY.calendarSyncStopFailed
          : code === 'functions/permission-denied'
            ? HELM_COPY.calendarSyncNotWritable
            : HELM_COPY.calendarSyncFailed,
      );
      setIsWorking(false);
      inFlight.current = false;
    }
  };

  const failureNote = failure && (
    <p className='text-destructive text-sm text-pretty' role='alert'>
      {failure}
    </p>
  );
  const offlineNote = isOffline && (
    <p className='text-muted-foreground text-[13px] text-pretty'>
      {HELM_COPY.connectionsNeedConnectionBody}
    </p>
  );

  if (view === 'stop' && sync) {
    return (
      <div className='flex flex-col gap-4'>
        <p className='text-foreground text-[15px] text-pretty'>
          {needsReconnect
            ? HELM_COPY.calendarSyncReconnectLead(name)
            : HELM_COPY.calendarSyncOnLead(name, sync.calendarName)}
        </p>
        {needsReconnect ? (
          <InlineNotice tone='warning'>
            {HELM_COPY.calendarSyncReconnect}
          </InlineNotice>
        ) : (
          <>
            <p className='text-muted-foreground text-[15px] text-pretty'>
              {HELM_COPY.calendarSyncStopDetail(name, sync.calendarName)}
            </p>
            {sync.isMadeByHelm && (
              <p className='text-muted-foreground text-[13px] text-pretty'>
                {HELM_COPY.calendarSyncStopMade}
              </p>
            )}
          </>
        )}
        {failureNote}
        <ModalFooterActions
          cancelAction={
            <Button
              type='button'
              variant='tertiary'
              onClick={onClose}
              disabled={isWorking}
            >
              {HELM_COPY.calendarSyncKeepGoing}
            </Button>
          }
          rightActions={
            isOffline ? (
              <LockedButton
                label={HELM_COPY.calendarSyncStopTitle}
                title={HELM_COPY.connectionsNeedConnection}
              >
                <p>{HELM_COPY.connectionsNeedConnectionBody}</p>
              </LockedButton>
            ) : needsReconnect ? (
              <Button
                type='button'
                onClick={() => {
                  onClose();
                  begin({ accountId });
                }}
              >
                {HELM_COPY.calendarSyncReconnectAction}
              </Button>
            ) : (
              <Button
                type='button'
                variant='destructive'
                loading={isWorking}
                onClick={() => void run({ action: 'stop' })}
              >
                {HELM_COPY.calendarSyncStopTitle}
              </Button>
            )
          }
        />
      </div>
    );
  }

  if (view === 'pick') {
    return (
      <div className='flex flex-col gap-4'>
        <p className='text-muted-foreground text-[15px] text-pretty'>
          {HELM_COPY.calendarSyncPickLead}
        </p>
        {calendars.isPending && (
          <p className='text-muted-foreground text-[13px]' role='status'>
            {HELM_COPY.calendarSyncLoadingCalendars}
          </p>
        )}
        {calendars.isError && (
          <div className='flex flex-col items-start gap-2'>
            <p className='text-destructive text-sm text-pretty' role='alert'>
              {HELM_COPY.calendarPickerFailed}
            </p>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              onClick={() => void calendars.refetch()}
            >
              {HELM_COPY.googleTryAgain}
            </Button>
          </div>
        )}
        {calendars.isSuccess && writable.length === 0 && (
          <p className='text-muted-foreground text-[15px] text-pretty'>
            {HELM_COPY.calendarSyncNoneWritable}
          </p>
        )}
        {writable.length > 0 && (
          <MethodPicker
            disabled={isWorking || isOffline}
            methods={writable.map((option) => ({
              id: option.id,
              emoji: (
                <span
                  aria-hidden='true'
                  className='bg-muted-foreground size-3 rounded-full'
                  style={
                    option.colour
                      ? { backgroundColor: option.colour }
                      : undefined
                  }
                />
              ),
              title: option.isPrimary
                ? HELM_COPY.calendarPickerMain
                : option.name,
              description:
                option.isPrimary ||
                (option.detail ?? option.name) !== option.name
                  ? (option.detail ?? option.name)
                  : HELM_COPY.calendarSyncPickDetail,
              onPick: () =>
                void run({
                  action: 'choose',
                  accountId,
                  calendarId: option.id,
                }),
            }))}
          />
        )}
        {offlineNote}
        {failureNote}
        <Button
          type='button'
          variant='tertiary'
          className='self-start'
          onClick={() => {
            setFailure(null);
            setView('start');
          }}
          disabled={isWorking}
        >
          {HELM_COPY.calendarSyncBack}
        </Button>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-4'>
      <p className='text-muted-foreground text-[15px] text-pretty'>
        {isGone
          ? HELM_COPY.calendarSyncGoneLead(name)
          : HELM_COPY.calendarSyncLead(name)}
      </p>
      <MethodPicker
        disabled={isWorking || isOffline}
        methods={[
          {
            id: 'make',
            emoji: '✨',
            title: HELM_COPY.calendarSyncMakeTitle,
            description: HELM_COPY.calendarSyncMakeDetail(name),
            onPick: () => void run({ action: 'make', accountId }),
          },
          {
            id: 'choose',
            emoji: '📅',
            title: HELM_COPY.calendarSyncChooseTitle,
            description: HELM_COPY.calendarSyncChooseDetail,
            onPick: () => {
              setFailure(null);
              setView('pick');
            },
          },
        ]}
      />
      {isWorking && (
        <p className='text-muted-foreground text-[13px]' role='status'>
          {HELM_COPY.calendarSyncWorking}
        </p>
      )}
      {offlineNote}
      {failureNote}
    </div>
  );
}

function CalendarSyncSheet({
  isOpen,
  onClose,
  accountId,
}: CalendarSyncSheetProps) {
  return (
    <FormSheet
      isOpen={isOpen}
      onClose={onClose}
      title={HELM_COPY.calendarSyncTitle}
    >
      {isOpen && <SyncForm onClose={onClose} accountId={accountId} />}
    </FormSheet>
  );
}

export default CalendarSyncSheet;

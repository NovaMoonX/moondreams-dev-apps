import { useRef, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { CalendarOff } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import BackLink from '@/components/BackLink';
import FormSheet from '@/components/FormSheet';
import InlineNotice from '@/components/InlineNotice';
import LockedButton from '@/components/LockedButton';
import MethodPicker from '@/components/MethodPicker';
import ModalFooterActions from '@/components/ModalFooterActions';
import { readConnectorOptions } from '@/lib/connections/connectionCalls';
import type { ConnectorOption } from '@/lib/connections/contract';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useAppSelector } from '@/store';
import { formatDate, formatTime } from '@/utils/formatUtils';
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

const formatLastWritten = (at: number) =>
  new Date(at).toDateString() === new Date().toDateString()
    ? formatTime(at)
    : `${formatDate(at)}, ${formatTime(at)}`;

function SyncForm({
  onClose,
  accountId,
}: Omit<CalendarSyncSheetProps, 'isOpen'>) {
  const name = useAssistantName();
  const isOffline = useNetworkStatus() === 'offline';
  const { begin, requestCalendarScopes } = useGoogleConnect();
  const { confirm } = useActionModal();
  const { addToast } = useToast();
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
      const result = await setHelmCalendarSync(request).catch(
        async (error: unknown) => {
          const scope = readNeededScope(error, request);
          if (scope === null) throw error;
          const outcome = await requestCalendarScopes(accountId, [scope]).catch(
            (consentError: unknown) => {
              console.error('Calendar consent did not finish', consentError);
              return 'cancelled' as const;
            },
          );
          if (outcome === 'redirected') return null;
          if (outcome === 'cancelled') {
            setFailure(HELM_COPY.calendarSyncCancelled);
            setIsWorking(false);
            inFlight.current = false;
            return null;
          }
          return setHelmCalendarSync(request);
        },
      );
      if (result === null) return;
      if (request.action === 'stop' && sync) {
        addToast({
          title: HELM_COPY.calendarSyncStopped(
            result.removedCount,
            sync.calendarName,
          ),
          description:
            result.leftCount > 0
              ? HELM_COPY.calendarSyncStoppedLeft(result.leftCount)
              : undefined,
          type: 'success',
        });
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
    const askToStop = async () => {
      const isConfirmed = await confirm({
        title: HELM_COPY.calendarSyncStopTitle,
        message:
          HELM_COPY.calendarSyncStopDetail(name, sync.calendarName) +
          (sync.isMadeByHelm ? HELM_COPY.calendarSyncStopMade : ''),
        confirmText: HELM_COPY.calendarSyncStopAction,
        destructive: true,
      });
      if (isConfirmed) void run({ action: 'stop' });
    };
    return (
      <div className='flex flex-col gap-4'>
        {needsReconnect ? (
          <InlineNotice tone='warning'>
            {HELM_COPY.calendarSyncReconnectLead(name)}
          </InlineNotice>
        ) : (
          <p className='text-foreground text-[15px] text-pretty'>
            {HELM_COPY.calendarSyncOnLead(
              sync.calendarName,
              sync.lastWrittenAt === null
                ? null
                : formatLastWritten(sync.lastWrittenAt),
            )}
          </p>
        )}
        <div className='pt-4'>
          {isOffline ? (
            <LockedButton
              label={HELM_COPY.calendarSyncStopRow}
              title={HELM_COPY.connectionsNeedConnection}
            >
              <p>{HELM_COPY.connectionsNeedConnectionBody}</p>
            </LockedButton>
          ) : (
            <ActionRow
              icon={<CalendarOff className='size-4' aria-hidden='true' />}
              label={HELM_COPY.calendarSyncStopRow}
              subtitle={HELM_COPY.calendarSyncStopRowDetail}
              onClick={() => void askToStop()}
              isDisabled={isWorking}
              isDestructive
            />
          )}
        </div>
        {isWorking && (
          <p className='text-muted-foreground text-[13px]' role='status'>
            {HELM_COPY.calendarSyncStopping}
          </p>
        )}
        {failureNote}
        <ModalFooterActions
          rightActions={
            needsReconnect && !isOffline ? (
              <>
                <Button type='button' variant='tertiary' onClick={onClose}>
                  {HELM_COPY.calendarSyncDone}
                </Button>
                <Button
                  type='button'
                  onClick={() => {
                    onClose();
                    begin({ accountId });
                  }}
                >
                  {HELM_COPY.calendarSyncReconnectAction}
                </Button>
              </>
            ) : (
              <Button
                type='button'
                variant='secondary'
                onClick={onClose}
                disabled={isWorking}
              >
                {HELM_COPY.calendarSyncDone}
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
        <BackLink
          label={HELM_COPY.calendarSyncBack}
          onBack={() => {
            if (isWorking) return;
            setFailure(null);
            setView('start');
          }}
        />
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
                  : '',
              onPick: () =>
                void run({
                  action: 'choose',
                  accountId,
                  calendarId: option.id,
                }),
            }))}
          />
        )}
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

  return (
    <div className='flex flex-col gap-4'>
      <p className='text-foreground text-[15px] text-pretty'>
        {isGone
          ? HELM_COPY.calendarSyncGoneLead(name)
          : HELM_COPY.calendarSyncLead(name)}
      </p>
      <p className='text-muted-foreground -mt-2 text-[13px] text-pretty'>
        {HELM_COPY.calendarSyncLeadNote(name)}
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
            description: HELM_COPY.calendarSyncChooseDetail(name),
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

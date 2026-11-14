import { useEffect, useRef, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { Button } from '@moondreamsdev/dreamer-ui/components';

import AppCheckbox from '@/components/AppCheckbox';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import FormSheet from '@/components/FormSheet';
import LockedButton from '@/components/LockedButton';
import ModalFooterActions from '@/components/ModalFooterActions';
import { MultiPillGroup } from '@/components/PillGroup';
import SectionDivider from '@/components/SectionDivider';
import {
  grantConnection,
  readConnectorOptions,
  releaseUnusedAccount,
  syncConnections,
  updateConnection,
} from '@/lib/connections/connectionCalls';
import type { ConnectorOption } from '@/lib/connections/contract';
import { useConnections } from '@/lib/connections/useConnections';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useAppSelector } from '@/store';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { setShiftCalendarIds } from '@apps/helm/store/actions/settingsActions';

export interface CalendarPickerTarget {
  /** Null while the trip back from Google is still finishing, so the sheet is already up when the person lands. */
  accountId: string | null;
  /** Connecting stages everything until Connect; editing a live grant applies on Save. */
  mode: 'connect' | 'edit';
}

const CONNECTOR_ID = 'google:calendar';

const failureLine = (error: unknown) => {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'functions/already-exists')
    return HELM_COPY.connectAlreadyConnected(HELM_COPY.googleCalendarName);
  if (code === 'functions/not-found') return HELM_COPY.connectionGone;
  return HELM_COPY.calendarPickerFailedToSave;
};

function PickerForm({
  target,
  onClose,
  onDismiss,
  registerClose,
}: {
  target: CalendarPickerTarget;
  /** The picker is finished: what was staged is applied. */
  onClose: () => void;
  /** The person leaves without applying anything. */
  onDismiss: () => void;
  registerClose: (close: (() => void) | null) => void;
}) {
  const { accountId, mode } = target;
  const name = useAssistantName();
  const { user } = useAuth();
  const { addToast } = useToast();
  const isOffline = useNetworkStatus() === 'offline';
  const shiftIds = useAppSelector(
    (state) => state.helm.profile?.shiftCalendarIds ?? [],
  );
  const { grants, isKnown } = useConnections({ readerAppId: 'helm' });
  const grant =
    grants.find(
      (entry) =>
        entry.connectorId === CONNECTOR_ID &&
        entry.accountId === accountId &&
        entry.status !== 'ended',
    ) ?? null;
  const [tickEdits, setTickEdits] = useState<Record<string, boolean>>({});
  const [shiftEdits, setShiftEdits] = useState<Record<string, boolean>>({});
  const [isTouched, setIsTouched] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const calendars = useQuery({
    queryKey: ['helm', 'calendarOptions', accountId],
    queryFn: () =>
      readConnectorOptions({
        connectorId: CONNECTOR_ID,
        accountId: accountId ?? '',
      }),
    enabled: accountId !== null,
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const isGrantPending = mode === 'edit' && !grant;
  const hasFailed = calendars.isError;
  const options = calendars.data ?? [];
  const isReady = calendars.isSuccess && !isGrantPending;
  const shiftKey = (option: ConnectorOption) => `${accountId}/${option.id}`;
  const isTicked = (option: ConnectorOption) =>
    tickEdits[option.id] ??
    (mode === 'connect'
      ? option.isOnByDefault
      : (grant?.options?.calendarIds.includes(option.id) ?? false));
  const isShift = (option: ConnectorOption) =>
    isTicked(option) &&
    (shiftEdits[option.id] ?? shiftIds.includes(shiftKey(option)));
  const calendarIds = options.filter(isTicked).map((option) => option.id);
  const isNoneTicked = calendarIds.length === 0;
  const ordered = [...options].sort(
    (a, b) =>
      Number(b.isPrimary) - Number(a.isPrimary) ||
      Number(b.isOnByDefault) - Number(a.isOnByDefault),
  );
  const mine = ordered.filter((option) => option.isOnByDefault);
  const others = ordered.filter((option) => !option.isOnByDefault);
  const ticked = ordered.filter(isTicked);
  const isDirty =
    mode === 'edit' &&
    isReady &&
    options.some(
      (option) =>
        isTicked(option) !==
          (grant?.options?.calendarIds.includes(option.id) ?? false) ||
        isShift(option) !==
          ((grant?.options?.calendarIds.includes(option.id) ?? false) &&
            shiftIds.includes(shiftKey(option))),
    );
  const requestClose = useDiscardGuard({
    isDirty,
    onClose: onDismiss,
    isBusy: isSaving,
  });
  useEffect(() => {
    registerClose(requestClose);
    return () => registerClose(null);
  });

  const save = async () => {
    setIsTouched(true);
    if (!isReady || isNoneTicked || isSaving || !user || accountId === null)
      return;
    setIsSaving(true);
    setFailure(null);
    try {
      const grantId =
        mode === 'connect'
          ? await grantConnection({
              readerAppId: 'helm',
              connectorId: CONNECTOR_ID,
              accountId,
              categoryIds: ['events'],
              options: { calendarIds },
            })
          : await updateConnection({
              grantId: grant?.id ?? '',
              options: { calendarIds },
            }).then(() => grant?.id ?? '');
      const nextShifts = [
        ...shiftIds.filter((key) => !key.startsWith(`${accountId}/`)),
        ...options.filter(isShift).map(shiftKey),
      ];
      if (
        nextShifts.length !== shiftIds.length ||
        nextShifts.some((key) => !shiftIds.includes(key))
      ) {
        setShiftCalendarIds(user.uid, nextShifts).catch((error: unknown) => {
          console.error('Helm shift calendars were not saved', error);
          addToast({
            title: HELM_COPY.calendarPickerFailedToSave,
            type: 'error',
          });
        });
      }
      syncConnections({ grantId }).catch((error: unknown) =>
        console.error('Helm calendar sync did not run', error),
      );
      onClose();
    } catch (error) {
      console.error('Helm calendars did not save', error);
      setFailure(failureLine(error));
      setIsSaving(false);
    }
  };

  const confirmLabel =
    mode === 'connect'
      ? HELM_COPY.calendarPickerConnect
      : HELM_COPY.calendarPickerSave;

  const renderRow = (option: ConnectorOption) => (
    <li key={option.id}>
      <label className='flex min-h-14 items-center gap-3 py-2'>
        <AppCheckbox
          aria-label={option.name}
          checked={isTicked(option)}
          onCheckedChange={(isOn) =>
            setTickEdits((edits) => ({ ...edits, [option.id]: isOn }))
          }
        />
        <span
          aria-hidden='true'
          className='bg-muted-foreground border-border size-3 shrink-0 rounded-full border'
          style={option.colour ? { backgroundColor: option.colour } : undefined}
        />
        <span className='min-w-0 flex-1'>
          <span className='text-foreground block text-[15px] [overflow-wrap:anywhere]'>
            {option.isPrimary ? HELM_COPY.calendarPickerMain : option.name}
          </span>
          {option.isPrimary && option.name !== HELM_COPY.calendarPickerMain && (
            <span className='text-muted-foreground block text-[13px] [overflow-wrap:anywhere]'>
              {option.name}
            </span>
          )}
        </span>
      </label>
    </li>
  );

  return (
    <div className='flex flex-col gap-4'>
      <p className='text-muted-foreground text-[15px] text-pretty'>
        {HELM_COPY.calendarPickerLead(name)}
      </p>
      {!hasFailed && !isReady && (
        <p className='text-muted-foreground text-[13px]' role='status'>
          {accountId === null
            ? HELM_COPY.calendarPickerFinishing
            : isGrantPending && isKnown
              ? HELM_COPY.connectionGone
              : HELM_COPY.calendarPickerLoading}
        </p>
      )}
      {hasFailed && (
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
      {isReady && options.length === 0 && (
        <p className='text-muted-foreground text-[15px] text-pretty'>
          {HELM_COPY.calendarPickerEmpty}
        </p>
      )}
      {isReady && options.length > 0 && (
        <div className='flex flex-col gap-2'>
          {mine.length > 0 && (
            <ul className='divide-border flex flex-col divide-y'>
              {mine.map(renderRow)}
            </ul>
          )}
          {others.length > 0 && (
            <>
              <SectionDivider
                label={HELM_COPY.calendarPickerOthers}
                className='pt-2'
              />
              <ul className='divide-border flex flex-col divide-y'>
                {others.map(renderRow)}
              </ul>
            </>
          )}
        </div>
      )}
      {isReady && ticked.length > 0 && (
        <div className='flex flex-col gap-3'>
          <SectionDivider label={HELM_COPY.calendarPickerShiftsTitle} />
          <p className='text-muted-foreground text-[13px] text-pretty'>
            {HELM_COPY.calendarPickerShiftsHint}
          </p>
          <MultiPillGroup
            label={HELM_COPY.calendarPickerShiftsTitle}
            showAll
            options={ticked.map((option) => ({
              value: option.id,
              label: option.isPrimary
                ? HELM_COPY.calendarPickerMain
                : option.name,
            }))}
            values={ticked.filter(isShift).map((option) => option.id)}
            onChange={(values) =>
              setShiftEdits(
                Object.fromEntries(
                  ticked.map((option) => [
                    option.id,
                    values.includes(option.id),
                  ]),
                ),
              )
            }
          />
        </div>
      )}
      {isTouched && isNoneTicked && options.length > 0 && (
        <p className='text-destructive text-sm' role='alert'>
          {HELM_COPY.calendarPickerTickOne}
        </p>
      )}
      {failure && (
        <p className='text-destructive text-sm text-pretty' role='alert'>
          {failure}
        </p>
      )}
      <ModalFooterActions
        cancelAction={
          <Button
            type='button'
            variant='tertiary'
            onClick={requestClose}
            disabled={isSaving}
          >
            {mode === 'connect'
              ? HELM_COPY.connectNotNow
              : HELM_COPY.disconnectCancel}
          </Button>
        }
        rightActions={
          isOffline ? (
            <LockedButton
              label={confirmLabel}
              title={HELM_COPY.connectionsNeedConnection}
            >
              <p>{HELM_COPY.connectionsNeedConnectionBody}</p>
            </LockedButton>
          ) : (
            <Button
              type='button'
              loading={isSaving}
              disabled={!isReady || options.length === 0}
              onClick={() => void save()}
            >
              {confirmLabel}
            </Button>
          )
        }
      />
    </div>
  );
}

/** Which of an account's calendars count, and which are shifts: staged on the sheet and applied together. A calendar added in Google later shows unticked; one deleted there is gone from the list. Backing out of a first connection forgets the account, since nothing was connected. */
function CalendarPicker({
  target,
  onClose,
}: {
  target: CalendarPickerTarget | null;
  onClose: () => void;
}) {
  const closeRef = useRef<(() => void) | null>(null);

  const dismiss = () => {
    if (target?.mode === 'connect' && target.accountId !== null)
      releaseUnusedAccount({ accountId: target.accountId }).catch(
        (error: unknown) =>
          console.error('Helm unused account was not released', error),
      );
    onClose();
  };

  return (
    <FormSheet
      isOpen={target !== null}
      onClose={() => (closeRef.current ?? dismiss)()}
      title={HELM_COPY.googleWhichCalendars}
    >
      {target && (
        <PickerForm
          key={`${target.accountId}|${target.mode}`}
          target={target}
          onClose={onClose}
          onDismiss={dismiss}
          registerClose={(run) => {
            closeRef.current = run;
          }}
        />
      )}
    </FormSheet>
  );
}

export default CalendarPicker;

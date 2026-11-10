import { useEffect, useState } from 'react';

import { Button, Checkbox } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import FormSheet from '@/components/FormSheet';
import LockedButton from '@/components/LockedButton';
import ModalFooterActions from '@/components/ModalFooterActions';
import {
  grantConnection,
  readConnectorOptions,
  syncConnections,
  updateConnection,
} from '@/lib/connections/connectionCalls';
import type { ConnectorOption } from '@/lib/connections/contract';
import { useConnections } from '@/lib/connections/useConnections';
import { useAuth } from '@/hooks/useAuth';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useAppSelector } from '@/store';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { setShiftCalendarIds } from '@apps/helm/store/actions/settingsActions';

export interface CalendarPickerTarget {
  accountId: string;
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
}: {
  target: CalendarPickerTarget;
  onClose: () => void;
}) {
  const { accountId, mode } = target;
  const name = useAssistantName();
  const { user } = useAuth();
  const { addToast } = useToast();
  const isOffline = useNetworkStatus() === 'offline';
  const shiftIds = useAppSelector(
    (state) => state.helm.profile?.shiftCalendarIds ?? [],
  );
  const { grants } = useConnections({ readerAppId: 'helm' });
  const grant =
    grants.find(
      (entry) =>
        entry.connectorId === CONNECTOR_ID &&
        entry.accountId === accountId &&
        entry.status !== 'ended',
    ) ?? null;
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{
    attempt: number;
    options: ConnectorOption[] | null;
  } | null>(null);
  const [tickEdits, setTickEdits] = useState<Record<string, boolean>>({});
  const [shiftEdits, setShiftEdits] = useState<Record<string, boolean>>({});
  const [isTouched, setIsTouched] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    readConnectorOptions({ connectorId: CONNECTOR_ID, accountId })
      .then((options) => isCurrent && setLoaded({ attempt, options }))
      .catch((error: unknown) => {
        console.error('Helm calendars did not load', error);
        if (isCurrent) setLoaded({ attempt, options: null });
      });
    return () => {
      isCurrent = false;
    };
  }, [accountId, attempt]);

  const current = loaded?.attempt === attempt ? loaded : null;
  const options = current?.options ?? [];
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

  const save = async () => {
    setIsTouched(true);
    if (isNoneTicked || isSaving || !user) return;
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

  return (
    <div className='flex flex-col gap-4'>
      <p className='text-muted-foreground text-[15px] text-pretty'>
        {HELM_COPY.calendarPickerLead(name)}
      </p>
      {!current && (
        <p className='text-muted-foreground text-[13px]' role='status'>
          {HELM_COPY.calendarPickerLoading}
        </p>
      )}
      {current && current.options === null && (
        <div className='flex flex-col items-start gap-2'>
          <p className='text-destructive text-sm text-pretty' role='alert'>
            {HELM_COPY.calendarPickerFailed}
          </p>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            onClick={() => setAttempt((count) => count + 1)}
          >
            {HELM_COPY.googleTryAgain}
          </Button>
        </div>
      )}
      {current?.options && options.length === 0 && (
        <p className='text-muted-foreground text-[15px] text-pretty'>
          {HELM_COPY.calendarPickerEmpty}
        </p>
      )}
      {options.length > 0 && (
        <ul className='divide-border flex flex-col divide-y'>
          {options.map((option) => (
            <li key={option.id} className='py-1'>
              <label className='flex min-h-12 items-center gap-3 py-2'>
                <Checkbox
                  aria-label={option.name}
                  checked={isTicked(option)}
                  onCheckedChange={(isOn) =>
                    setTickEdits((edits) => ({ ...edits, [option.id]: isOn }))
                  }
                />
                <span
                  aria-hidden='true'
                  className='bg-muted-foreground size-3 shrink-0 rounded-full'
                  style={
                    option.colour
                      ? { backgroundColor: option.colour }
                      : undefined
                  }
                />
                <span className='min-w-0 flex-1'>
                  <span className='text-foreground block text-[15px] break-words'>
                    {option.name}
                  </span>
                  {option.isPrimary && (
                    <span className='text-muted-foreground block text-[13px]'>
                      {HELM_COPY.calendarPickerMain}
                    </span>
                  )}
                </span>
              </label>
              {isTicked(option) && (
                <label className='flex min-h-10 items-center gap-3 pb-2 pl-9'>
                  <Checkbox
                    aria-label={`${HELM_COPY.calendarPickerShifts}: ${option.name}`}
                    checked={isShift(option)}
                    onCheckedChange={(isOn) =>
                      setShiftEdits((edits) => ({
                        ...edits,
                        [option.id]: isOn,
                      }))
                    }
                  />
                  <span className='text-muted-foreground text-[13px]'>
                    {HELM_COPY.calendarPickerShifts}
                  </span>
                </label>
              )}
            </li>
          ))}
        </ul>
      )}
      {calendarIds.length > 0 && (
        <p className='text-muted-foreground text-[13px] text-pretty'>
          {HELM_COPY.calendarPickerShiftsHint}
        </p>
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
            onClick={onClose}
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
              disabled={!current?.options || options.length === 0}
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

/** Which of an account's calendars count, and which are shifts: staged on the sheet and applied together. A calendar added in Google later shows unticked; one deleted there is gone from the list. */
function CalendarPicker({
  target,
  onClose,
}: {
  target: CalendarPickerTarget | null;
  onClose: () => void;
}) {
  return (
    <FormSheet
      isOpen={target !== null}
      onClose={onClose}
      title={HELM_COPY.googleWhichCalendars}
    >
      {target && (
        <PickerForm
          key={`${target.accountId}|${target.mode}`}
          target={target}
          onClose={onClose}
        />
      )}
    </FormSheet>
  );
}

export default CalendarPicker;

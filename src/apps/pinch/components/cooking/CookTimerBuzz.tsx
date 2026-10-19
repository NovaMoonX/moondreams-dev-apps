import { useState } from 'react';

import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import ModalFooterActions from '@/components/ModalFooterActions';
import PromptRow from '@/components/PromptRow';
import { useSheetHistory } from '@/hooks/useBackHistory';
import { turnOnDevicePush } from '@/lib/notifications/devicePush';
import {
  devicePushQueryOptions,
  notificationsQueryKeys,
} from '@/lib/notifications/notificationsQueries';
import { REMINDER_KINDS } from '@apps/pinch/constants';
import { usePinchSettings } from '@apps/pinch/hooks/usePinchSettings';
import {
  getDeviceReminderText,
  getTurnOnFailureText,
} from '@apps/pinch/utils/settings';
import {
  getTimerBuzzOffer,
  type TimerBuzzOffer,
} from '@apps/pinch/utils/cooks';

const TIMERS_KIND = REMINDER_KINDS.find((kind) => kind.key === 'timers');

const BLOCKED_STATES: TimerBuzzOffer[] = ['blocked', 'unsupported'];

const getStateNote = (offer: TimerBuzzOffer) => {
  if (offer === 'blocked') return getDeviceReminderText('blocked');
  if (offer === 'unsupported') {
    return `${getDeviceReminderText('unsupported')} Your timer stays right, but it can only ring while the screen is on.`;
  }
  return null;
};

interface CookTimerBuzzProps {
  uid: string;
}

/** Under a running timer, one quiet row offers to buzz this device when the timer ends while the screen is off, and a small sheet asks for the browser's permission on its own Turn on tap and switches the Timers reminder on with it. It draws nothing once the device can be reached with timer pushes on. */
function CookTimerBuzz({ uid }: CookTimerBuzzProps) {
  const queryClient = useQueryClient();
  const { settings, save } = usePinchSettings(uid);
  const device = useQuery(devicePushQueryOptions(uid)).data ?? null;
  const offer = getTimerBuzzOffer(device, settings.reminders.timers);
  const [isOpen, setIsOpen] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const close = () => {
    setIsOpen(false);
    setIsDone(false);
    setFailure(null);
  };
  const { dialogId, onDialogClose } = useSheetHistory(isOpen, close);

  const turnOn = async () => {
    setFailure(null);
    setIsAsking(true);
    try {
      const result = device === 'on' ? 'on' : await turnOnDevicePush(uid);
      if (result === 'on') {
        setIsDone(await save({ reminders: { timers: true } }));
        return;
      }
      setFailure(
        result === 'dismissed'
          ? 'Nothing changed. Tap Turn on when you are ready.'
          : getTurnOnFailureText(result),
      );
    } finally {
      setIsAsking(false);
      await queryClient.invalidateQueries({
        queryKey: notificationsQueryKeys.device(uid),
      });
    }
  };

  const isConfirmed = isDone;
  const isStuck = BLOCKED_STATES.includes(offer);
  const note = isConfirmed ? null : (getStateNote(offer) ?? failure);

  return (
    <>
      {offer !== 'none' && (
        <PromptRow
          icon='🔔'
          isCompact
          title='Buzz me if the screen is off'
          actionLabel='Turn on'
          onAction={() => setIsOpen(true)}
        />
      )}
      <Modal
        id={dialogId}
        isOpen={isOpen}
        onClose={onDialogClose}
        title={TIMERS_KIND?.title ?? 'Timers when the screen is off'}
        className='border-border border'
      >
        <div className='[&_.form-footer]:bg-popover space-y-3 text-sm [&_.form-footer]:sticky [&_.form-footer]:bottom-0 [&_.form-footer]:-mx-6 [&_.form-footer]:-mb-6 [&_.form-footer]:rounded-b-lg [&_.form-footer]:px-6 [&_.form-footer]:pt-2 [&_.form-footer]:pb-4'>
          {isConfirmed ? (
            <p>
              Done. Pinch will send this device a notification when a timer
              ends, even with the screen off.
            </p>
          ) : (
            <>
              <p>
                A screen that is off can’t ring a timer. Turn this on and Pinch
                sends a notification when a timer ends, even if you switched
                apps.
              </p>
              <p className='text-muted-foreground text-xs'>
                Your browser will ask first. Turn it off any time in Settings.
              </p>
            </>
          )}
          <ModalFooterActions
            note={note}
            cancelAction={
              isConfirmed ? undefined : (
                <Button type='button' variant='secondary' onClick={close}>
                  {isStuck ? 'Close' : 'Not now'}
                </Button>
              )
            }
            rightActions={
              isConfirmed ? (
                <Button type='button' onClick={close}>
                  Done
                </Button>
              ) : (
                <Button
                  type='button'
                  loading={isAsking}
                  disabled={isStuck}
                  onClick={() => void turnOn()}
                >
                  Turn on
                </Button>
              )
            }
          />
        </div>
      </Modal>
    </>
  );
}

export default CookTimerBuzz;

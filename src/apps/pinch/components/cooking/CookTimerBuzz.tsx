import PushOptInRow from '@/components/PushOptInRow';
import { REMINDER_KINDS } from '@apps/pinch/constants';
import { usePinchSettings } from '@apps/pinch/hooks/usePinchSettings';

const TIMERS_KIND = REMINDER_KINDS.find((kind) => kind.key === 'timers');

interface CookTimerBuzzProps {
  uid: string;
}

/** Under a running timer, one quiet row offers to buzz this device when the timer ends while the screen is off; the shared opt-in asks the browser on its own Turn on tap and Pinch switches the Timers reminder on with it. */
function CookTimerBuzz({ uid }: CookTimerBuzzProps) {
  const { settings, save } = usePinchSettings(uid);

  return (
    <PushOptInRow
      uid={uid}
      icon='🔔'
      title='Buzz me if the screen is off'
      modalTitle={TIMERS_KIND?.title ?? 'Timers when the screen is off'}
      body={
        <p>
          A screen that is off can’t ring a timer. Turn this on and Pinch sends
          a notification when a timer ends, even if you switched apps.
        </p>
      }
      note='Your browser will ask first. Turn it off any time in Settings, after you leave cooking mode.'
      doneText='Done. Pinch will send this device a notification when a timer ends, even with the screen off.'
      unsupportedNote='Your timer stays right, but it can only ring while the screen is on.'
      isSettingOn={settings.reminders.timers}
      onTurnedOn={() => save({ reminders: { timers: true } })}
    />
  );
}

export default CookTimerBuzz;

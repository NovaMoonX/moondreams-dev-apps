import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, Footprints, X } from 'lucide-react';

import DetailSheet from '@/components/DetailSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import { useLocalStoragePreference } from '@/hooks/useLocalStoragePreference';
import { useAppSelector } from '@/store';
import { TRACK_INVITE_WORDS } from '@apps/runway/constants';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import LineUpScreen from '@apps/runway/screens/plan/LineUpScreen';

const DISMISSED_KEY_PREFIX = 'runway.trackInviteDismissed.';

const ROWS = [
  { name: TRACK_INVITE_WORDS.planName, body: TRACK_INVITE_WORDS.planBody },
  { name: TRACK_INVITE_WORDS.trackName, body: TRACK_INVITE_WORDS.trackBody },
] as const;

/** Home's one quiet invitation for a Plan person to try Track, shown once an income day has been confirmed; hiding it lasts on this device. */
function TrackInviteCard() {
  const { user } = useAuth();
  const [isDismissed, setIsDismissed] = useLocalStoragePreference(
    `${DISMISSED_KEY_PREFIX}${user?.uid ?? ''}`,
    false,
  );
  const [isOpen, setIsOpen] = useState(false);
  const [isLineUp, setIsLineUp] = useState(false);
  const hasTracked = useAppSelector(
    (state) => (state.runway.plan?.trackingPeriods ?? []).length > 0,
  );
  const isPlan = useAppSelector((state) => selectLevel(state) === 'plan');
  const hasConfirmedDay = useAppSelector((state) =>
    state.runway.days.some((day) => day.status === 'confirmed'),
  );

  if (!isPlan || !hasConfirmedDay || hasTracked || isDismissed || !user)
    return null;

  const turnOn = () => {
    setIsOpen(false);
    setIsLineUp(true);
  };

  return (
    <>
      <section
        aria-label={TRACK_INVITE_WORDS.title}
        className='bg-card border-border flex min-h-12 items-stretch rounded-2xl border'
      >
        <Button
          type='button'
          variant='tertiary'
          className='hover:bg-muted/60 h-auto min-h-0 min-w-0 flex-1 justify-start gap-3 rounded-2xl px-3! py-1! text-left max-[359px]:gap-2 max-[359px]:px-2!'
          onClick={() => setIsOpen(true)}
        >
          <Footprints
            className='text-muted-foreground h-5 w-5 shrink-0'
            aria-hidden='true'
          />
          <span className='min-w-0 flex-1'>
            <span className='text-foreground block text-sm leading-5 font-medium'>
              {TRACK_INVITE_WORDS.title}
            </span>
            <span className='text-muted-foreground block text-xs leading-4'>
              {TRACK_INVITE_WORDS.subtitle}
            </span>
          </span>
          <ChevronRight
            className='text-muted-foreground h-5 w-5 shrink-0'
            aria-hidden='true'
          />
        </Button>
        <Button
          type='button'
          variant='tertiary'
          size='icon'
          aria-label={TRACK_INVITE_WORDS.dismiss}
          title={TRACK_INVITE_WORDS.dismiss}
          className='text-muted-foreground! mr-1 size-10 min-w-10 shrink-0 self-center rounded-full p-0'
          onClick={() => setIsDismissed(true)}
        >
          <X className='h-5 w-5' aria-hidden='true' />
        </Button>
      </section>
      <DetailSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={TRACK_INVITE_WORDS.sheetTitle}
        footer={
          <div className='p-4'>
            <ModalFooterActions
              cancelAction={
                <Button
                  type='button'
                  variant='secondary'
                  onClick={() => setIsOpen(false)}
                >
                  {TRACK_INVITE_WORDS.notNow}
                </Button>
              }
              rightActions={
                <Button
                  type='button'
                  className='whitespace-nowrap'
                  onClick={turnOn}
                >
                  {TRACK_INVITE_WORDS.turnOn}
                </Button>
              }
            />
          </div>
        }
      >
        <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
          {ROWS.map((row) => (
            <li key={row.name} className='px-3 py-2.5'>
              <p className='text-sm font-medium'>{row.name}</p>
              <p className='text-muted-foreground text-sm'>{row.body}</p>
            </li>
          ))}
        </ul>
        <p className='text-muted-foreground mt-3 text-sm'>
          {TRACK_INVITE_WORDS.switchBack}
        </p>
      </DetailSheet>
      {isLineUp && <LineUpScreen onClose={() => setIsLineUp(false)} />}
    </>
  );
}

export default TrackInviteCard;

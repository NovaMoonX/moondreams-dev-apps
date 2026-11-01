import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Check, ChevronRight, Footprints } from 'lucide-react';

import DetailSheet from '@/components/DetailSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import { useLocalStoragePreference } from '@/hooks/useLocalStoragePreference';
import { useAppSelector } from '@/store';
import { TRACK_INVITE_WORDS } from '@apps/runway/constants';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import LineUpScreen from '@apps/runway/screens/plan/LineUpScreen';

const DISMISSED_KEY_PREFIX = 'runway.trackInviteDismissed.';

const OPTIONS = [
  {
    name: TRACK_INVITE_WORDS.planName,
    lead: TRACK_INVITE_WORDS.planLead,
    points: TRACK_INVITE_WORDS.planPoints,
    isStep: false,
  },
  {
    name: TRACK_INVITE_WORDS.trackName,
    lead: TRACK_INVITE_WORDS.trackLead,
    points: TRACK_INVITE_WORDS.trackPoints,
    isStep: true,
  },
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

  if (isLineUp && isPlan)
    return <LineUpScreen onClose={() => setIsLineUp(false)} />;
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
          className='hover:bg-muted/60 h-auto min-h-0 min-w-0 flex-1 justify-start gap-3 rounded-2xl px-4! py-3.5! text-left max-[359px]:px-3!'
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
            <span className='text-muted-foreground mt-0.5 block text-xs leading-4'>
              {TRACK_INVITE_WORDS.subtitle}
            </span>
          </span>
          <ChevronRight
            className='text-muted-foreground h-5 w-5 shrink-0'
            aria-hidden='true'
          />
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
        <div className='space-y-3'>
          {OPTIONS.map((option) => (
            <section
              key={option.name}
              aria-label={option.name}
              className={join(
                'bg-card rounded-2xl border p-4',
                option.isStep ? 'border-primary' : 'border-border',
              )}
            >
              <p className='text-base font-semibold'>{option.name}</p>
              <p className='text-muted-foreground text-sm'>{option.lead}</p>
              <ul className='mt-2 space-y-1.5'>
                {option.points.map((point) => (
                  <li key={point} className='flex items-start gap-2 text-sm'>
                    <Check
                      className={join(
                        'mt-0.5 size-4 shrink-0',
                        option.isStep
                          ? 'text-primary'
                          : 'text-muted-foreground',
                      )}
                      aria-hidden='true'
                    />
                    {point}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <p className='text-muted-foreground mt-3 text-sm'>
          {TRACK_INVITE_WORDS.switchBack}
        </p>
        <div className='mt-4 flex justify-center'>
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            className='text-muted-foreground!'
            onClick={() => {
              setIsOpen(false);
              setIsDismissed(true);
            }}
          >
            {TRACK_INVITE_WORDS.dismiss}
          </Button>
        </div>
      </DetailSheet>
    </>
  );
}

export default TrackInviteCard;

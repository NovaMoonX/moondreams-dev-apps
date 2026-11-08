import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { LocateFixed, Moon, Sun, SunMoon, Sunset } from 'lucide-react';

import FormSheet from '@/components/FormSheet';
import InlineNotice from '@/components/InlineNotice';
import ModalFooterActions from '@/components/ModalFooterActions';
import SegmentedControl, {
  type SegmentOption,
} from '@/components/SegmentedControl';
import { useSiteTheme, type SiteTheme } from '@/hooks/useSiteTheme';
import type { SunsetState } from '@/lib/theme/sunsetTheme';
import { formatTime } from '@/utils/formatUtils';
import { formatTimezoneLabel } from '@/utils/timezoneUtils';

const THEME_OPTIONS: readonly SegmentOption<SiteTheme>[] = [
  {
    value: 'system',
    label: 'Auto',
    icon: SunMoon,
    ariaLabel: 'Auto, match this device',
  },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  {
    value: 'sunset',
    label: 'Sunset',
    icon: Sunset,
    ariaLabel: 'Sunset, dark from sunset to sunrise',
  },
];

const FIVE_MINUTES = 5 * 60_000;

const describeSunset = ({
  isDark,
  nextSwitchAt,
  nextSwitchTo,
  isEstimate,
}: SunsetState) => {
  if (nextSwitchTo === null) {
    return isDark ? 'Dark all day today' : 'Light all day today';
  }
  const look = nextSwitchTo === 'dark' ? 'Dark' : 'Light';
  if (isEstimate) {
    const rounded = Math.round(nextSwitchAt / FIVE_MINUTES) * FIVE_MINUTES;
    return `${look} at about ${formatTime(rounded)}`;
  }
  return `${look} at ${formatTime(nextSwitchAt)}`;
};

type AskStep = { kind: 'ask' } | { kind: 'declined'; reason: string };

/** The site-wide Auto / Light / Dark / Sunset choice; Auto follows the device's setting, Sunset the sun where the person is. */
function ThemePicker() {
  const {
    theme,
    setTheme,
    sunset,
    sunPlace,
    timeZone,
    requestSunLocation,
    declineSunLocation,
  } = useSiteTheme();
  const [askStep, setAskStep] = useState<AskStep | null>(null);
  const [isAsking, setIsAsking] = useState(false);

  const status =
    theme === 'system'
      ? 'Follows your device'
      : sunset
        ? describeSunset(sunset)
        : null;

  const chooseTheme = (next: SiteTheme) => {
    setTheme(next);
    if (next === 'sunset' && sunPlace === null) {
      setAskStep({ kind: 'ask' });
    }
  };

  const askForLocation = async () => {
    setIsAsking(true);
    const result = await requestSunLocation();
    setIsAsking(false);
    setAskStep(result.isGranted ? null : { kind: 'declined', reason: result.reason });
  };

  const skip = () => {
    declineSunLocation();
    setAskStep(null);
  };

  const zoneName = timeZone ? formatTimezoneLabel(timeZone) : null;

  return (
    <div className='space-y-2 px-2'>
      <div className='flex items-baseline justify-between gap-3'>
        <span className='text-foreground text-base font-semibold'>Theme</span>
        {status && (
          <span className='text-muted-foreground truncate text-xs'>
            {status}
          </span>
        )}
      </div>
      <SegmentedControl
        label='Choose a theme'
        options={THEME_OPTIONS}
        value={theme}
        onChange={chooseTheme}
        isStacked
      />
      {sunset?.isEstimate && (
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          className="text-muted-foreground relative -ml-2 gap-1.5 px-2 text-xs before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']"
          onClick={() => setAskStep({ kind: 'ask' })}
        >
          <LocateFixed className='size-3.5' />
          Use my location for exact times
        </Button>
      )}
      <FormSheet
        isOpen={askStep !== null}
        onClose={() => setAskStep(null)}
        title='Sunset times'
      >
        {askStep?.kind === 'declined' ? (
          <>
            <div className='pb-4'>
              <InlineNotice tone='info' title='Using estimated times'>
                {askStep.reason}{' '}
                {zoneName
                  ? `Sunset will follow your time zone (${zoneName}) instead, usually within half an hour of the real sunset.`
                  : 'Sunset will turn dark at 7 PM and light at 7 AM instead.'}
              </InlineNotice>
            </div>
            <ModalFooterActions
              rightActions={
                <Button type='button' onClick={() => setAskStep(null)}>
                  Done
                </Button>
              }
            />
          </>
        ) : (
          <>
            <div className='text-muted-foreground space-y-3 pb-4 text-sm'>
              <p>
                Sunset turns the site dark when the sun goes down where you
                are, and light again when it comes up.
              </p>
              <p>
                For exact times, we’ll ask your device for your location. It’s
                only used to work out sunrise and sunset, rounded to about a
                kilometre, and it never leaves this device.
              </p>
              <p>Skip it and we’ll estimate from your time zone instead.</p>
            </div>
            <ModalFooterActions
              cancelAction={
                <Button
                  type='button'
                  variant='tertiary'
                  disabled={isAsking}
                  onClick={skip}
                >
                  Skip
                </Button>
              }
              rightActions={
                <Button
                  type='button'
                  loading={isAsking}
                  onClick={() => void askForLocation()}
                >
                  Use my location
                </Button>
              }
            />
          </>
        )}
      </FormSheet>
    </div>
  );
}

export default ThemePicker;

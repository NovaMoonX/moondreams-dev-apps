import { useEffect, useRef } from 'react';

import GatesClosedNote from '@/components/GatesClosedNote';
import IntroCard from '@/components/IntroCard';
import LogoCredit from '@/components/LogoCredit';
import SectionHeader from '@/components/SectionHeader';
import SettingsGroup from '@/components/SettingsGroup';
import { useAppSelector } from '@/store';
import { hasBrandLogos } from '@/utils/brandLogoUtils';
import KeepingSection from '@apps/pinch/components/settings/KeepingSection';
import NumbersRow from '@apps/pinch/components/settings/NumbersRow';
import PhotosSection from '@apps/pinch/components/settings/PhotosSection';
import RemindersSection from '@apps/pinch/components/settings/RemindersSection';
import StartTabRow from '@apps/pinch/components/settings/StartTabRow';
import PicksRow from '@apps/pinch/components/settings/PicksRow';
import UnitsRow from '@apps/pinch/components/settings/UnitsRow';
import SharedLinksSection from '@apps/pinch/components/settings/SharedLinksSection';
import {
  selectPinchSettings,
  selectPinchSettingsLoadError,
} from '@apps/pinch/store/selectors';

interface SettingsScreenProps {
  uid: string;
}

/** The choices that reach every tab. A group whose document couldn't be read draws nothing to change, since its switches would show the defaults as the person's choices; the other groups read other documents and stay. */
function SettingsScreen({ uid }: SettingsScreenProps) {
  const loadError = useAppSelector(selectPinchSettingsLoadError);
  const hasPicks = useAppSelector(
    (state) =>
      Object.keys(selectPinchSettings(state).ingredientPicks).length > 0,
  );
  const screenRef = useRef<HTMLElement>(null);

  useEffect(() => {
    screenRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section
      ref={screenRef}
      aria-label='Settings'
      tabIndex={-1}
      className='space-y-4 outline-none'
    >
      <SectionHeader title='Settings' />
      <div className='space-y-5 md:grid md:grid-cols-2 md:items-start md:space-y-0 md:gap-x-6'>
        <div className='space-y-5'>
          <SettingsGroup title='What you see'>
            {loadError === null && <StartTabRow uid={uid} position='first' />}
            <NumbersRow
              uid={uid}
              position={loadError === null ? 'middle' : 'only'}
            />
            {loadError === null && (
              <UnitsRow uid={uid} position={hasPicks ? 'middle' : 'last'} />
            )}
            {loadError === null && hasPicks && (
              <PicksRow uid={uid} position='last' />
            )}
          </SettingsGroup>
          {loadError !== null ? (
            <IntroCard
              icon='🧂'
              lead="Your reminders and keeping days couldn't load just now."
            />
          ) : (
            <RemindersSection uid={uid} />
          )}
        </div>
        <div className='space-y-5 empty:hidden'>
          {loadError === null && (
            <>
              <KeepingSection uid={uid} />
              <PhotosSection uid={uid} />
            </>
          )}
          <SharedLinksSection />
        </div>
      </div>
      <GatesClosedNote appId='pinch' />
      <p className='text-muted-foreground px-1 pt-1 text-xs text-pretty'>
        <span className='font-medium'>About the numbers:</span> nutrition values
        are approximate, based on USDA FoodData Central.
      </p>
      {hasBrandLogos() && <LogoCredit subject='Store logos' className='px-1' />}
    </section>
  );
}

export default SettingsScreen;

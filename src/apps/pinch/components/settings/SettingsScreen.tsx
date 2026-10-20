import { useEffect, useRef } from 'react';

import IntroCard from '@/components/IntroCard';
import SectionHeader from '@/components/SectionHeader';
import { useAppSelector } from '@/store';
import KeepingSection from '@apps/pinch/components/settings/KeepingSection';
import NutritionSection from '@apps/pinch/components/settings/NutritionSection';
import PhotosSection from '@apps/pinch/components/settings/PhotosSection';
import RemindersSection from '@apps/pinch/components/settings/RemindersSection';
import SharedLinksSection from '@apps/pinch/components/settings/SharedLinksSection';
import { selectPinchSettingsLoadError } from '@apps/pinch/store/selectors';

interface SettingsScreenProps {
  uid: string;
}

/** The choices that reach every tab. A group whose document couldn't be read draws nothing to change, since its switches would show the defaults as the person's choices; the other groups read other documents and stay. */
function SettingsScreen({ uid }: SettingsScreenProps) {
  const loadError = useAppSelector(selectPinchSettingsLoadError);
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
      <div className='space-y-5 lg:grid lg:grid-cols-2 lg:items-start lg:space-y-0 lg:gap-x-6'>
        <div className='space-y-5'>
          <NutritionSection uid={uid} />
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
      <p className='text-muted-foreground px-1 pt-1 text-xs text-pretty'>
        <span className='font-medium'>About the numbers:</span> nutrition values
        are approximate, based on USDA FoodData Central. Store logos are
        provided by Logo.dev and remain their owners' trademarks.
      </p>
    </section>
  );
}

export default SettingsScreen;

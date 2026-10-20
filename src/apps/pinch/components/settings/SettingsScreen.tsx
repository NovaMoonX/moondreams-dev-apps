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

/** The choices that reach every tab. When the settings couldn't be read there is nothing honest to show: the switches would draw the defaults as the person's choices. */
function SettingsScreen({ uid }: SettingsScreenProps) {
  const loadError = useAppSelector(selectPinchSettingsLoadError);

  return (
    <section className='space-y-4'>
      <SectionHeader title='Settings' />
      <div className='space-y-5'>
        {loadError !== null ? (
          <IntroCard icon='🧂' lead="Your settings couldn't load just now." />
        ) : (
          <>
            <NutritionSection uid={uid} />
            <RemindersSection uid={uid} />
            <KeepingSection uid={uid} />
            <PhotosSection uid={uid} />
          </>
        )}
        <SharedLinksSection />
      </div>
    </section>
  );
}

export default SettingsScreen;

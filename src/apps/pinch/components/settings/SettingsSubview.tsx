import IntroCard from '@/components/IntroCard';
import Subview from '@/components/Subview';
import { useAppSelector } from '@/store';
import KeepingSection from '@apps/pinch/components/settings/KeepingSection';
import PhotosSection from '@apps/pinch/components/settings/PhotosSection';
import RemindersSection from '@apps/pinch/components/settings/RemindersSection';
import SharedLinksSection from '@apps/pinch/components/settings/SharedLinksSection';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import { selectPinchSettingsLoadError } from '@apps/pinch/store/selectors';

interface SettingsSubviewProps {
  uid: string;
}

/** What Pinch reminds the person about, and how long a new fridge or freezer box starts with. Every change saves as it is made. When the settings couldn't be read there is nothing honest to show: the switches would draw the defaults as the person's choices. */
function SettingsSubview({ uid }: SettingsSubviewProps) {
  const { closeSubview } = usePinchOverlay();
  const loadError = useAppSelector(selectPinchSettingsLoadError);

  return (
    <Subview title='Settings' onClose={closeSubview}>
      <div className='space-y-5'>
        {loadError !== null ? (
          <IntroCard icon='🧂' lead="Your settings couldn't load just now." />
        ) : (
          <>
            <IntroCard icon='🧂' lead='Changes save as you make them.' />
            <RemindersSection uid={uid} />
            <KeepingSection uid={uid} />
            <PhotosSection uid={uid} />
          </>
        )}
        <SharedLinksSection />
      </div>
    </Subview>
  );
}

export default SettingsSubview;

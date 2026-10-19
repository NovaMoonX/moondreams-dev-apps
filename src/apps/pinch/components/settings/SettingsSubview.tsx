import IntroCard from '@/components/IntroCard';
import Subview from '@/components/Subview';
import KeepingSection from '@apps/pinch/components/settings/KeepingSection';
import PhotosSection from '@apps/pinch/components/settings/PhotosSection';
import RemindersSection from '@apps/pinch/components/settings/RemindersSection';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';

interface SettingsSubviewProps {
  uid: string;
}

/** What Pinch reminds the person about, and how long a new fridge or freezer box starts with. Every change saves as it is made. */
function SettingsSubview({ uid }: SettingsSubviewProps) {
  const { closeSubview } = usePinchOverlay();

  return (
    <Subview title='Settings' onClose={closeSubview}>
      <div className='space-y-5'>
        <IntroCard
          icon='🧂'
          lead='What Pinch reminds you about, how long leftovers keep, and photo ideas.'
        >
          Changes save as you make them.
        </IntroCard>
        <RemindersSection uid={uid} />
        <KeepingSection uid={uid} />
        <PhotosSection uid={uid} />
      </div>
    </Subview>
  );
}

export default SettingsSubview;

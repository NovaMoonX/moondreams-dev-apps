import AppToggle from '@/components/AppToggle';
import SettingsGroup from '@/components/SettingsGroup';
import SettingsRow from '@/components/SettingsRow';
import { usePinchSettings } from '@apps/pinch/hooks/usePinchSettings';

interface PhotosSectionProps {
  uid: string;
}

/** Whether a new recipe's Photo drawer looks for pictures on the web. Off, the title is never sent anywhere. */
function PhotosSection({ uid }: PhotosSectionProps) {
  const { settings, save } = usePinchSettings(uid);

  return (
    <SettingsGroup title='Photos'>
      <SettingsRow
        icon='🖼️'
        title='Suggest photos for new recipes'
        description='When you add a photo to a new recipe, Pinch searches the web with its title and shows pictures to pick from. Nothing else is sent.'
        control={
          <AppToggle
            aria-label='Suggest photos for new recipes'
            checked={settings.suggestPhotos}
            onCheckedChange={(isChecked) =>
              void save({ suggestPhotos: isChecked })
            }
          />
        }
      />
    </SettingsGroup>
  );
}

export default PhotosSection;

import AppToggle from '@/components/AppToggle';
import SettingsGroup from '@/components/SettingsGroup';
import SettingsRow from '@/components/SettingsRow';
import { usePinchSettings } from '@apps/pinch/hooks/usePinchSettings';

interface PhotosSectionProps {
  uid: string;
}

/** What the AI may add to a new recipe that the source doesn't give: pictures from the web for its title, and a cookbook's missing steps, times and keeping. Off, nothing is sent and nothing is added. */
function PhotosSection({ uid }: PhotosSectionProps) {
  const { settings, save } = usePinchSettings(uid);

  return (
    <SettingsGroup title='Adding recipes'>
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
      <SettingsRow
        icon='📖'
        title='Finish recipes like a cookbook'
        description='The AI adds the steps a recipe leaves out, like melting the butter, gives honest prep and cook times, and says how to keep it. Off: it fills in only what you give it.'
        control={
          <AppToggle
            aria-label='Finish recipes like a cookbook'
            checked={settings.isFinishingRecipes}
            onCheckedChange={(isChecked) =>
              void save({ isFinishingRecipes: isChecked })
            }
          />
        }
      />
    </SettingsGroup>
  );
}

export default PhotosSection;

import SegmentedControl from '@/components/SegmentedControl';
import SettingsGroup from '@/components/SettingsGroup';
import SettingsRow from '@/components/SettingsRow';
import { PINCH_TAB_LABELS, START_TAB_CHOICES } from '@apps/pinch/constants';
import { usePinchSettings } from '@apps/pinch/hooks/usePinchSettings';

interface StartTabSectionProps {
  uid: string;
}

/** Which tab Pinch opens on. Saved with the account, so every device opens the same way. */
function StartTabSection({ uid }: StartTabSectionProps) {
  const { settings, save } = usePinchSettings(uid);

  return (
    <SettingsGroup title='Opening screen'>
      <SettingsRow
        icon='🏠'
        title='Open Pinch on'
        description='The tab you land on when you open Pinch, on every device you use.'
      >
        <SegmentedControl
          label='Open Pinch on'
          className='mt-3'
          options={START_TAB_CHOICES.map((tab) => ({
            value: tab,
            label: PINCH_TAB_LABELS[tab],
          }))}
          value={settings.defaultTab}
          onChange={(defaultTab) => void save({ defaultTab })}
        />
      </SettingsRow>
    </SettingsGroup>
  );
}

export default StartTabSection;

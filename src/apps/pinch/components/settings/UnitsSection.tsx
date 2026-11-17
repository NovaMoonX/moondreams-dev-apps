import AppToggle from '@/components/AppToggle';
import { PillGroup } from '@/components/PillGroup';
import SettingsGroup from '@/components/SettingsGroup';
import SettingsRow from '@/components/SettingsRow';
import { usePinchSettings } from '@apps/pinch/hooks/usePinchSettings';
import type { VolumeUnits, WeightUnits } from '@apps/pinch/types';

interface UnitsSectionProps {
  uid: string;
}

const WEIGHT_CHOICES: { value: WeightUnits; label: string }[] = [
  { value: 'AS_WRITTEN', label: 'As written' },
  { value: 'METRIC', label: 'Grams' },
  { value: 'US', label: 'Ounces' },
];

const VOLUME_CHOICES: { value: VolumeUnits; label: string }[] = [
  { value: 'AS_WRITTEN', label: 'As written' },
  { value: 'METRIC', label: 'Millilitres' },
  { value: 'CUPS', label: 'Cups' },
  { value: 'FL_OZ', label: 'Fluid ounces' },
];

/** The units recipes are adapted to. Saved with the account, so every device reads and cooks the same way. */
function UnitsSection({ uid }: UnitsSectionProps) {
  const { settings, save } = usePinchSettings(uid);
  const { units } = settings;

  return (
    <SettingsGroup
      title='Units'
      footer={
        units.weight !== 'AS_WRITTEN' || units.volume !== 'AS_WRITTEN'
          ? 'Recipes you read in, and cooking mode, use these. For a saved recipe, open it and tap Adapt to my units.'
          : undefined
      }
    >
      <SettingsRow icon='⚖️' title='Weights'>
        <PillGroup
          label='Weights'
          options={WEIGHT_CHOICES}
          value={units.weight}
          onChange={(weight) => void save({ units: { weight } })}
        />
      </SettingsRow>
      <SettingsRow icon='🥛' title='Volumes'>
        <PillGroup
          label='Volumes'
          options={VOLUME_CHOICES}
          value={units.volume}
          onChange={(volume) => void save({ units: { volume } })}
        />
      </SettingsRow>
      {units.volume === 'METRIC' && (
        <SettingsRow
          icon='🥄'
          title='Keep teaspoons and tablespoons'
          control={
            <AppToggle
              aria-label='Keep teaspoons and tablespoons'
              checked={units.keepSpoons}
              onCheckedChange={(keepSpoons) =>
                void save({ units: { keepSpoons } })
              }
            />
          }
        />
      )}
    </SettingsGroup>
  );
}

export default UnitsSection;

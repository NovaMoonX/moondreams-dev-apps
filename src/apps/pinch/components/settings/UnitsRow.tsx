import AppToggle from '@/components/AppToggle';
import { PillGroup } from '@/components/PillGroup';
import SummaryEditor from '@/components/SummaryEditor';
import type { SummaryGroupPosition } from '@/components/summaryGroup';
import { usePinchSettings } from '@apps/pinch/hooks/usePinchSettings';
import type {
  PinchUnitSettings,
  VolumeUnits,
  WeightUnits,
} from '@apps/pinch/types';

interface UnitsRowProps {
  uid: string;
  position: SummaryGroupPosition;
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

const labelOf = <T extends string>(
  choices: { value: T; label: string }[],
  value: T,
) => choices.find((choice) => choice.value === value)?.label ?? '';

/** "Ounces and cups", "Grams, volumes as written" or "As written". */
const getUnitsSummary = ({ weight, volume }: PinchUnitSettings) => {
  const weightWord = labelOf(WEIGHT_CHOICES, weight);
  const volumeWord = labelOf(VOLUME_CHOICES, volume);
  if (weight === 'AS_WRITTEN' && volume === 'AS_WRITTEN') return 'As written';
  if (weight === 'AS_WRITTEN') return `${volumeWord}, weights as written`;
  if (volume === 'AS_WRITTEN') return `${weightWord}, volumes as written`;
  return `${weightWord} and ${volumeWord.toLowerCase()}`;
};

/** The units recipes are adapted to. Saved with the account, so every device reads and cooks the same way. */
function UnitsRow({ uid, position }: UnitsRowProps) {
  const { settings, save } = usePinchSettings(uid);
  const { units } = settings;
  const isAsWritten =
    units.weight === 'AS_WRITTEN' && units.volume === 'AS_WRITTEN';

  return (
    <li className='-mx-3'>
      <SummaryEditor
        label='Units'
        title='Units'
        groupPosition={position}
        icon='⚖️'
        summary={getUnitsSummary(units)}
        placeholder=''
        shouldFocus={false}
      >
        <p className='text-muted-foreground text-sm text-pretty'>
          {isAsWritten
            ? 'Recipes you read in, and cooking mode, can use the units you measure with.'
            : 'Recipes you read in, and cooking mode, use these. For a saved recipe, open it and tap Adapt to my units.'}
        </p>
        <div className='space-y-2'>
          <p className='font-medium'>Weights</p>
          <PillGroup
            label='Weights'
            options={WEIGHT_CHOICES}
            value={units.weight}
            onChange={(weight) => void save({ units: { weight } })}
          />
        </div>
        <div className='space-y-2'>
          <p className='font-medium'>Volumes</p>
          <PillGroup
            label='Volumes'
            options={VOLUME_CHOICES}
            value={units.volume}
            onChange={(volume) => void save({ units: { volume } })}
          />
        </div>
        {units.volume === 'METRIC' && (
          <label className='flex min-h-10 cursor-pointer items-center justify-between gap-3'>
            <span className='font-medium'>Keep teaspoons and tablespoons</span>
            <AppToggle
              aria-label='Keep teaspoons and tablespoons'
              checked={units.keepSpoons}
              onCheckedChange={(keepSpoons) =>
                void save({ units: { keepSpoons } })
              }
            />
          </label>
        )}
      </SummaryEditor>
    </li>
  );
}

export default UnitsRow;

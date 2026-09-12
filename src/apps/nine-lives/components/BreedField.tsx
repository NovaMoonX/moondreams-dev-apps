import { Input, Label, Select } from '@moondreamsdev/dreamer-ui/components';

import { CAT_BREEDS, CUSTOM_BREED_OPTION } from '@apps/nine-lives/constants/presetOptions';
import type { BreedValue } from '@apps/nine-lives/utils/breedUtils';

interface BreedFieldProps {
  value: BreedValue;
  onValueChange: (value: BreedValue) => void;
  disabled?: boolean;
}

const breedOptions = [
  ...CAT_BREEDS.map((option) => ({ text: option, value: option })),
  { text: 'Custom breed', value: CUSTOM_BREED_OPTION },
];

function BreedField({ value, onValueChange, disabled }: BreedFieldProps) {
  return (
    <div className='space-y-3'>
      <Select
        options={breedOptions}
        value={value.preset}
        onChange={(nextPreset) => onValueChange({ ...value, preset: nextPreset })}
        searchable
        disabled={disabled}
      />
      {value.preset === CUSTOM_BREED_OPTION && (
        <div className='space-y-1'>
          <Label>Custom breed</Label>
          <Input
            value={value.customBreed}
            onChange={(event) => onValueChange({ ...value, customBreed: event.target.value })}
            placeholder='Enter a breed if it is not listed'
            variant='outline'
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}

export default BreedField;

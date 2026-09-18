import { useAppSelector } from '@/store';
import { Input, Select } from '@moondreamsdev/dreamer-ui/components';
import { shallowEqual } from 'react-redux';
import { selectCustomHealthRecordTypesByHousehold } from '../store/selectors';
import { HealthRecordType } from '../types';

export const NEW_TYPE_VALUE = '__new__';
export interface RecordTypeChoice {
  value: HealthRecordType | typeof NEW_TYPE_VALUE;
  customRecordTypeId: string | null;
  customLabel: string;
}

const BUILT_IN_TYPE_OPTIONS = [
  { label: 'Lab result', value: 'lab_result' },
  { label: 'Vet paperwork', value: 'vet_paperwork' },
  { label: 'Insurance', value: 'insurance' },
  { label: 'Adoption / shelter', value: 'shelter_adoption' },
  { label: 'Prescription', value: 'prescription' },
  { label: 'Microchip registration', value: 'microchip_registration' },
  { label: 'Miscellaneous', value: 'miscellaneous' },
] as const;

function RecordTypeField({
  value,
  onValueChange,
  disabled,
  householdId,
}: {
  value: RecordTypeChoice;
  onValueChange: (choice: RecordTypeChoice) => void;
  disabled?: boolean;
  householdId: string;
}) {
  const customTypes = useAppSelector(
    selectCustomHealthRecordTypesByHousehold(householdId),
    shallowEqual,
  );

  const options = [
    ...BUILT_IN_TYPE_OPTIONS,
    ...customTypes.map((type) => ({
      label: type.label,
      value: `custom:${type.id}`,
    })),
    { label: 'Add a custom type…', value: NEW_TYPE_VALUE },
  ];
  const selectedValue =
    value.value === 'custom' && value.customRecordTypeId
      ? `custom:${value.customRecordTypeId}`
      : value.value;

  return (
    <div className='space-y-2'>
      <Select
        options={options.map((option) => ({
          text: option.label,
          value: option.value,
        }))}
        value={selectedValue}
        placeholder='Select a record type'
        disabled={disabled}
        searchable
        onChange={(nextValue) => {
          if (nextValue === NEW_TYPE_VALUE) {
            onValueChange({
              value: NEW_TYPE_VALUE,
              customRecordTypeId: null,
              customLabel: value.customLabel,
            });
            return;
          }

          if (nextValue.startsWith('custom:')) {
            onValueChange({
              value: 'custom',
              customRecordTypeId: nextValue.slice('custom:'.length),
              customLabel: '',
            });
            return;
          }

          onValueChange({
            value: nextValue as HealthRecordType,
            customRecordTypeId: null,
            customLabel: '',
          });
        }}
      />
      {value.value === NEW_TYPE_VALUE && (
        <Input
          value={value.customLabel}
          placeholder='e.g. Allergy test'
          disabled={disabled}
          onChange={(event) =>
            onValueChange({
              ...value,
              customLabel: event.target.value,
            })
          }
        />
      )}
    </div>
  );
}

export default RecordTypeField;

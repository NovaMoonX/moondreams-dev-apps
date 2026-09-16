import { Badge, Select } from '@moondreamsdev/dreamer-ui/components';
import { X } from '@moondreamsdev/dreamer-ui/symbols';

interface VisitOption {
  label: string;
  value: string;
}

interface LinkedVisitsFieldProps {
  /** Selected visit ids. */
  value: string[];
  onValueChange: (value: string[]) => void;
  visitOptions: VisitOption[];
  disabled?: boolean;
  /** When false, selecting a new visit replaces the current selection instead of appending. Defaults to true. */
  multiple?: boolean;
}

/**
 * Search-to-add, chip-to-remove picker for linking one or more visits to a
 * record. Replaces the old checkbox-list pattern, which didn't scale once a
 * household had more than a handful of visits.
 */
function LinkedVisitsField({
  value,
  onValueChange,
  visitOptions,
  disabled,
  multiple = true,
}: LinkedVisitsFieldProps) {
  const selectableOptions = visitOptions
    .filter((option) => !value.includes(option.value))
    .map((option) => ({ text: option.label, value: option.value }));

  const selectedVisits = value
    .map((visitId) => visitOptions.find((option) => option.value === visitId))
    .filter((option): option is VisitOption => Boolean(option));

  const addVisit = (visitId: string) => {
    onValueChange(multiple ? [...value, visitId] : [visitId]);
  };

  const removeVisit = (visitId: string) => {
    onValueChange(value.filter((id) => id !== visitId));
  };

  return (
    <div className='space-y-2'>
      {selectedVisits.length > 0 && (
        <div role='group' aria-label='Linked visits' className='flex flex-wrap gap-2'>
          {selectedVisits.map((visit) => (
            <Badge key={visit.value} variant='secondary' aspect='video' className='gap-1'>
              {visit.label}
              {!disabled && (
                <button
                  type='button'
                  onClick={() => removeVisit(visit.value)}
                  aria-label={`Remove linked visit ${visit.label}`}
                  className='hover:text-destructive'
                >
                  <X className='h-3 w-3' />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
      {(multiple || selectedVisits.length === 0) && selectableOptions.length > 0 && (
        <Select
          options={selectableOptions}
          value=''
          onChange={addVisit}
          searchable
          disabled={disabled}
          placeholder='Search visits to link…'
        />
      )}
    </div>
  );
}

export default LinkedVisitsField;

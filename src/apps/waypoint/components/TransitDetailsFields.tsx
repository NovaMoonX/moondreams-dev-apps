import { Button, Input, Label, Textarea } from '@moondreamsdev/dreamer-ui/components';

import FormSection from '@/ui/FormSection';
import { TRANSIT_FIELD_SPECS } from '@apps/waypoint/constants';
import type { TransitType } from '@apps/waypoint/types';
import type { TransitDraft } from '@apps/waypoint/utils/transitDetails';

interface TransitDetailsFieldsProps {
  transitType: TransitType;
  value: TransitDraft;
  onChange: (value: TransitDraft) => void;
}

function TransitDetailsFields({ transitType, value, onChange }: TransitDetailsFieldsProps) {
  const specs = TRANSIT_FIELD_SPECS[transitType];
  const essentialSpecs = specs.filter((spec) => spec.essential);
  const extraSpecs = specs.filter((spec) => !spec.essential);

  const setValue = (key: string, next: string) =>
    onChange({ ...value, values: { ...value.values, [key]: next } });

  const setCustomField = (index: number, changes: Partial<{ key: string; value: string }>) =>
    onChange({
      ...value,
      customFields: value.customFields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...changes } : field,
      ),
    });

  return (
    <div className='space-y-3'>
      {essentialSpecs.length > 0 && (
        <div className='grid grid-cols-2 gap-3'>
          {essentialSpecs.map((spec) => (
            <div key={spec.key} className='space-y-1.5'>
              <Label>{spec.label}</Label>
              <Input
                placeholder={spec.placeholder}
                value={value.values[spec.key] ?? ''}
                onChange={(event) => setValue(spec.key, event.target.value)}
              />
            </div>
          ))}
        </div>
      )}
      <FormSection label='+ Add details'>
        <div className='space-y-3'>
          {extraSpecs.map((spec) => (
            <div key={spec.key} className='space-y-1.5'>
              <Label>{spec.label}</Label>
              <Input
                placeholder={spec.placeholder}
                value={value.values[spec.key] ?? ''}
                onChange={(event) => setValue(spec.key, event.target.value)}
              />
            </div>
          ))}
          {transitType === 'OTHER' && (
            <div className='space-y-2'>
              <Label>Details</Label>
              {value.customFields.map((field, index) => (
                <div key={index} className='flex items-center gap-2'>
                  <Input
                    placeholder='Label'
                    value={field.key}
                    onChange={(event) => setCustomField(index, { key: event.target.value })}
                  />
                  <Input
                    placeholder='Value'
                    value={field.value}
                    onChange={(event) => setCustomField(index, { value: event.target.value })}
                  />
                  <Button
                    variant='tertiary'
                    size='sm'
                    aria-label='Remove detail'
                    onClick={() =>
                      onChange({
                        ...value,
                        customFields: value.customFields.filter(
                          (_, fieldIndex) => fieldIndex !== index,
                        ),
                      })
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button
                variant='tertiary'
                size='sm'
                className='h-auto p-0 text-xs'
                onClick={() =>
                  onChange({
                    ...value,
                    customFields: [...value.customFields, { key: '', value: '' }],
                  })
                }
              >
                + Add a detail
              </Button>
            </div>
          )}
          <div className='space-y-1.5'>
            <Label>Estimated travel time</Label>
            <div className='flex items-center gap-2'>
              <Input
                type='number'
                min={0}
                placeholder='0'
                className='w-20'
                value={value.hours}
                onChange={(event) => onChange({ ...value, hours: event.target.value })}
              />
              <span className='text-muted-foreground text-sm'>h</span>
              <Input
                type='number'
                min={0}
                max={59}
                placeholder='0'
                className='w-20'
                value={value.minutes}
                onChange={(event) => onChange({ ...value, minutes: event.target.value })}
              />
              <span className='text-muted-foreground text-sm'>min</span>
            </div>
          </div>
          <div className='space-y-1.5'>
            <Label>Travel notes</Label>
            <Textarea
              placeholder='Seat, terminal, baggage…'
              value={value.notes}
              onChange={(event) => onChange({ ...value, notes: event.target.value })}
            />
          </div>
        </div>
      </FormSection>
    </div>
  );
}

export default TransitDetailsFields;

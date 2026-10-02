import { useState } from 'react';

import { Button, Input, Label, Textarea } from '@moondreamsdev/dreamer-ui/components';
import { ListPlus, MapPin, StickyNote, Timer, Truck } from 'lucide-react';

import AddFieldChips, { RemovableField } from '@/components/forms/AddFieldChips';
import {
  TRANSIT_FIELD_SPECS,
  TRANSIT_GROUP_LABELS,
  type TransitFieldSpec,
} from '@apps/waypoint/constants';
import type { TransitType } from '@apps/waypoint/types';
import type { TransitDraft } from '@apps/waypoint/utils/transitDetails';

interface TransitDetailsFieldsProps {
  transitType: TransitType;
  value: TransitDraft;
  onChange: (value: TransitDraft) => void;
}

interface ExtraField {
  key: string;
  label: string;
  specs: TransitFieldSpec[];
}

const TRAVEL_TIME_KEY = 'travelTime';
const NOTES_KEY = 'notes';
const DETAILS_KEY = 'details';

function TransitDetailsFields({ transitType, value, onChange }: TransitDetailsFieldsProps) {
  const specs = TRANSIT_FIELD_SPECS[transitType];
  const essentialSpecs = specs.filter((spec) => spec.essential);
  const extraFields = specs
    .filter((spec) => !spec.essential)
    .reduce<ExtraField[]>((fields, spec) => {
      const key = spec.group ?? spec.key;
      const existing = fields.find((field) => field.key === key);
      if (existing) {
        return fields.map((field) =>
          field === existing ? { ...field, specs: [...field.specs, spec] } : field,
        );
      }
      return [
        ...fields,
        { key, label: spec.group ? TRANSIT_GROUP_LABELS[spec.group] : spec.label, specs: [spec] },
      ];
    }, []);

  const hasTravelTime = Boolean(value.hours || value.minutes);
  const [revealed, setRevealed] = useState<string[]>(() =>
    [
      ...extraFields
        .filter((field) => field.specs.some((spec) => value.values[spec.key]))
        .map((field) => field.key),
      ...(hasTravelTime ? [TRAVEL_TIME_KEY] : []),
      ...(value.notes ? [NOTES_KEY] : []),
      ...(value.customFields.length > 0 ? [DETAILS_KEY] : []),
    ],
  );

  const setValue = (key: string, next: string) =>
    onChange({ ...value, values: { ...value.values, [key]: next } });

  const setCustomField = (index: number, changes: Partial<{ key: string; value: string }>) =>
    onChange({
      ...value,
      customFields: value.customFields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...changes } : field,
      ),
    });

  const chips = [
    ...extraFields.map((field) => ({
      key: field.key,
      label: field.label,
      icon: field.specs[0].group ? <MapPin className='h-4 w-4' /> : <Truck className='h-4 w-4' />,
    })),
    ...(transitType === 'OTHER'
      ? [{ key: DETAILS_KEY, label: 'Details', icon: <ListPlus className='h-4 w-4' /> }]
      : []),
    { key: TRAVEL_TIME_KEY, label: 'Travel time', icon: <Timer className='h-4 w-4' /> },
    { key: NOTES_KEY, label: 'Notes', icon: <StickyNote className='h-4 w-4' /> },
  ].filter((chip) => !revealed.includes(chip.key));

  const hide = (key: string, cleared: Partial<TransitDraft>) => {
    setRevealed((current) => current.filter((item) => item !== key));
    onChange({ ...value, ...cleared });
  };

  return (
    <div className='space-y-4'>
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
      {extraFields
        .filter((field) => revealed.includes(field.key))
        .map((field) => (
          <RemovableField
            key={field.key}
            label={field.label}
            removeLabel={`Remove ${field.label.toLowerCase()}`}
            onRemove={() =>
              hide(field.key, {
                values: {
                  ...value.values,
                  ...Object.fromEntries(field.specs.map((spec) => [spec.key, ''])),
                },
              })
            }
          >
            <div className={field.specs.length > 1 ? 'grid gap-3 sm:grid-cols-2' : undefined}>
              {field.specs.map((spec) => (
                <Input
                  key={spec.key}
                  aria-label={spec.label}
                  placeholder={spec.label === field.label ? spec.placeholder : `${spec.label}: ${spec.placeholder}`}
                  value={value.values[spec.key] ?? ''}
                  onChange={(event) => setValue(spec.key, event.target.value)}
                />
              ))}
            </div>
          </RemovableField>
        ))}
      {revealed.includes(DETAILS_KEY) && transitType === 'OTHER' && (
        <RemovableField
          label='Details'
          removeLabel='Remove details'
          onRemove={() => hide(DETAILS_KEY, { customFields: [] })}
        >
          <div className='space-y-2'>
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
                  type='button'
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
              type='button'
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
        </RemovableField>
      )}
      {revealed.includes(TRAVEL_TIME_KEY) && (
        <RemovableField
          label='Estimated travel time'
          removeLabel='Remove travel time'
          onRemove={() => hide(TRAVEL_TIME_KEY, { hours: '', minutes: '' })}
        >
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
        </RemovableField>
      )}
      {revealed.includes(NOTES_KEY) && (
        <RemovableField
          label='Travel notes'
          removeLabel='Remove travel notes'
          onRemove={() => hide(NOTES_KEY, { notes: '' })}
        >
          <Textarea
            placeholder='Seat, terminal, baggage…'
            value={value.notes}
            onChange={(event) => onChange({ ...value, notes: event.target.value })}
          />
        </RemovableField>
      )}
      <AddFieldChips heading='Add travel details' chips={chips} onAdd={(key) => setRevealed((current) => [...current, key])} />
    </div>
  );
}

export default TransitDetailsFields;

import { useMemo, useState, type ReactNode } from 'react';

import { Button, Input, Label, Select, Textarea } from '@moondreamsdev/dreamer-ui/components';
import { useQuery } from '@tanstack/react-query';
import { ListPlus, MapPin, StickyNote, Timer, Truck } from 'lucide-react';

import AddFieldChips, { RemovableField } from '@/components/forms/AddFieldChips';
import SectionDivider from '@/components/forms/SectionDivider';
import { airlinesQueryOptions } from '@/lib/airlines/airlinesQueries';
import { airportsQueryOptions, type AirportOption } from '@/lib/airports/airportsQueries';
import {
  TRANSIT_FIELD_SPECS,
  TRANSIT_TYPE_LABELS,
  type TransitFieldSpec,
} from '@apps/waypoint/constants';
import type { TransitType } from '@apps/waypoint/types';
import type { TransitDraft } from '@apps/waypoint/utils/transitDetails';

interface TransitDetailsFieldsProps {
  transitType: TransitType;
  value: TransitDraft;
  onChange: (value: TransitDraft) => void;
  onDepartureAirportPicked?: (airport: AirportOption) => void;
  /** With an end time set the duration is implied, so the estimate isn't asked for. */
  hasEndTime: boolean;
  /** The event's location field, placed in the route section. */
  routeLocation?: ReactNode;
}

interface ExtraField {
  key: string;
  label: string;
  specs: TransitFieldSpec[];
}

const TRAVEL_TIME_KEY = 'travelTime';
const NOTES_KEY = 'notes';
const DETAILS_KEY = 'details';

const MAX_VISIBLE_OPTIONS = 50;

interface SearchOption {
  value: string;
  text: string;
  description?: string;
}

// Rendering thousands of rows is what makes the dropdown slow to open, so only the best
// matches are handed to the select.
function useLimitedOptions(options: SearchOption[], current: string) {
  const [term, setTerm] = useState('');
  const limited = useMemo(() => {
    const query = term.trim().toLowerCase();
    const matches = query
      ? options.filter((option) =>
          `${option.text} ${option.description ?? ''} ${option.value}`.toLowerCase().includes(query),
        )
      : options;
    const top = matches.slice(0, MAX_VISIBLE_OPTIONS);
    const selected = options.find((option) => option.value === current);
    return selected && !top.includes(selected) ? [selected, ...top] : top;
  }, [options, term, current]);
  return { options: limited, onSearch: setTerm };
}

interface AirlineFieldProps {
  value: TransitDraft;
  onChange: (value: TransitDraft) => void;
}

function AirlineField({ value, onChange }: AirlineFieldProps) {
  const { data: airlines = [] } = useQuery(airlinesQueryOptions());
  const current = value.values.airline ?? '';
  const allOptions = useMemo(
    () => [
      ...airlines.map((airline) => ({
        value: airline.name,
        text: airline.name,
        description: airline.iataCode,
      })),
      ...(current && !airlines.some((airline) => airline.name === current)
        ? [{ value: current, text: current }]
        : []),
    ],
    [airlines, current],
  );
  const { options, onSearch } = useLimitedOptions(allOptions, current);

  const setAirline = (name: string) => {
    const match = airlines.find((airline) => airline.name === name);
    onChange({
      ...value,
      values: {
        ...value.values,
        airline: name,
        airlineIataCode: match?.iataCode ?? '',
        airlineIcaoCode: match?.icaoCode ?? '',
      },
    });
  };

  return (
    <Select
      searchable
      allowAdd
      clearable
      options={options}
      value={current}
      placeholder='Search airlines'
      searchPlaceholder='Search or add an airline'
      onSearch={onSearch}
      onChange={setAirline}
      onAdd={setAirline}
    />
  );
}

interface AirportFieldProps {
  fieldKey: string;
  value: TransitDraft;
  onChange: (value: TransitDraft) => void;
  onPicked?: (airport: AirportOption) => void;
}

function AirportField({ fieldKey, value, onChange, onPicked }: AirportFieldProps) {
  const { data: airports = [] } = useQuery(airportsQueryOptions());
  const current = value.values[fieldKey] ?? '';
  const allOptions = useMemo(
    () => [
      ...airports.map((airport) => ({
        value: airport.iataCode,
        text: `${airport.iataCode} · ${airport.city}`,
        description: `${airport.name}, ${airport.country}`,
      })),
      ...(current && !airports.some((airport) => airport.iataCode === current)
        ? [{ value: current, text: current }]
        : []),
    ],
    [airports, current],
  );
  const { options, onSearch } = useLimitedOptions(allOptions, current);

  const setAirport = (code: string) => {
    onChange({ ...value, values: { ...value.values, [fieldKey]: code } });
    const picked = airports.find((airport) => airport.iataCode === code);
    if (picked) {
      onPicked?.(picked);
    }
  };

  return (
    <Select
      searchable
      allowAdd
      clearable
      options={options}
      value={current}
      placeholder='Search airports'
      searchPlaceholder='Search or add an airport'
      onSearch={onSearch}
      onChange={setAirport}
      onAdd={(code) => setAirport(code.toUpperCase())}
    />
  );
}

function TransitDetailsFields({
  transitType,
  value,
  onChange,
  onDepartureAirportPicked,
  hasEndTime,
  routeLocation,
}: TransitDetailsFieldsProps) {
  const specs = TRANSIT_FIELD_SPECS[transitType].filter((spec) => !spec.hidden);
  const carrierSpecs = specs.filter((spec) => spec.essential && spec.section !== 'route');
  const routeSpecs = specs.filter((spec) => spec.essential && spec.section === 'route');
  const extraFields = specs
    .filter((spec) => !spec.essential)
    .map<ExtraField>((spec) => ({ key: spec.key, label: spec.label, specs: [spec] }));

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
      icon: field.key === 'startLocation' ? <MapPin className='h-4 w-4' /> : <Truck className='h-4 w-4' />,
    })),
    ...(transitType === 'OTHER'
      ? [{ key: DETAILS_KEY, label: 'Details', icon: <ListPlus className='h-4 w-4' /> }]
      : []),
    ...(hasEndTime
      ? []
      : [{ key: TRAVEL_TIME_KEY, label: 'Travel time', icon: <Timer className='h-4 w-4' /> }]),
    { key: NOTES_KEY, label: 'Notes', icon: <StickyNote className='h-4 w-4' /> },
  ].filter((chip) => !revealed.includes(chip.key));

  const renderSpec = (spec: TransitFieldSpec) => (
    <div key={spec.key} className='space-y-1.5'>
      <Label>{spec.label}</Label>
      {transitType === 'FLIGHT' && spec.key === 'airline' ? (
        <AirlineField value={value} onChange={onChange} />
      ) : transitType === 'FLIGHT' && spec.key.endsWith('AirportCode') ? (
        <AirportField
          fieldKey={spec.key}
          value={value}
          onChange={onChange}
          onPicked={spec.key === 'departureAirportCode' ? onDepartureAirportPicked : undefined}
        />
      ) : (
        <Input
          placeholder={spec.placeholder}
          value={value.values[spec.key] ?? ''}
          onChange={(event) => setValue(spec.key, event.target.value)}
        />
      )}
    </div>
  );

  const hide = (key: string, cleared: Partial<TransitDraft>) => {
    setRevealed((current) => current.filter((item) => item !== key));
    onChange({ ...value, ...cleared });
  };

  return (
    <div className='space-y-4'>
      {carrierSpecs.length > 0 && (
        <>
          <SectionDivider label={TRANSIT_TYPE_LABELS[transitType]} />
          <div className='grid grid-cols-2 gap-3'>{carrierSpecs.map(renderSpec)}</div>
        </>
      )}
      {(routeSpecs.length > 0 || routeLocation) && (
        <>
          <SectionDivider label='Route' />
          {transitType !== 'FLIGHT' && routeLocation}
          {routeSpecs.length > 0 && (
            <div className='grid grid-cols-2 gap-3'>{routeSpecs.map(renderSpec)}</div>
          )}
          {transitType === 'FLIGHT' && routeLocation}
        </>
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
            <div>
              {field.specs.map((spec) => (
                <Input
                  key={spec.key}
                  aria-label={spec.label}
                  placeholder={spec.placeholder}
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
      {revealed.includes(TRAVEL_TIME_KEY) && !hasEndTime && (
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

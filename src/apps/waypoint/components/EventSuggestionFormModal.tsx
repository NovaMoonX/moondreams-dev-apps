import { useMemo, useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Input,
  Textarea,
} from '@moondreamsdev/dreamer-ui/components';

import PlaceAutocompleteInput from '@/components/forms/PlaceAutocompleteInput';
import { UNLINKED_PLACE } from '@/lib/places/placesApi';
import type { PlaceSelectionBias, PlaceSelectionResult } from '@/lib/places/types';
import { fromLocalDateAndTimeInputValues, toLocalTimeInputValue } from '@/utils/dateInputUtils';
import { getDayIndex, getDayInputValue, getDayOptions } from '@/utils/dateRangeUtils';
import { MAX_DAYS_OUTSIDE_TRIP } from '@apps/waypoint/constants';
import { getErrorMessage } from '@/utils/errorUtils';
import { createTimeInputField } from '@/utils/formFactoryHelpers';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import type { EventSuggestion, TimelineEvent, TripSpace } from '@apps/waypoint/types';
import { getEventTime, isRelativeTrip } from '@apps/waypoint/utils/tripTime';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

interface EventSuggestionFormModalProps {
  isOpen: boolean;
  trip: TripSpace;
  event: TimelineEvent;
  suggestion?: EventSuggestion;
  placeBias?: PlaceSelectionBias;
  isSubmitting?: boolean;
  onSubmit: (fields: {
    suggestedTitle: string;
    suggestedStartAt: number | null;
    suggestedEndAt: number | null;
    suggestedDayIndex: number | null;
    suggestedStartTime: string | null;
    suggestedEndTime: string | null;
    suggestedLocationName: string | null;
    suggestedAddress: string | null;
    suggestedLatitude: number | null;
    suggestedLongitude: number | null;
    suggestedPlace: EventSuggestion['suggestedPlace'];
    note: string | null;
  }) => Promise<void> | void;
  onClose: () => void;
}

interface OptionalValue {
  enabled: boolean;
  value: string;
}

interface SuggestedLocation {
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  place: EventSuggestion['suggestedPlace'];
}

interface SuggestionFormData {
  title: string;
  dayIndex: string;
  time: string;
  endTime: OptionalValue;
  location: SuggestedLocation;
  note: OptionalValue;
}

const { custom, input, select } = FormFactories;

function getInitialData(
  trip: TripSpace,
  event: TimelineEvent,
  suggestion?: EventSuggestion,
): SuggestionFormData {
  const location = suggestion
    ? {
        name: suggestion.suggestedLocationName ?? '',
        address: suggestion.suggestedAddress ?? '',
        latitude: suggestion.suggestedLatitude,
        longitude: suggestion.suggestedLongitude,
        place: suggestion.suggestedPlace,
      }
    : {
        name: event.locationName ?? '',
        address: event.address ?? '',
        latitude: event.latitude,
        longitude: event.longitude,
        place: event.place,
      };
  const note = suggestion
    ? { enabled: Boolean(suggestion.note), value: suggestion.note ?? '' }
    : { enabled: false, value: '' };

  if (suggestion && isRelativeTrip(trip)) {
    return {
      title: suggestion.suggestedTitle,
      dayIndex: String(suggestion.suggestedDayIndex ?? 0),
      time: suggestion.suggestedStartTime || '09:00',
      endTime: {
        enabled: Boolean(suggestion.suggestedEndTime),
        value: suggestion.suggestedEndTime ?? '',
      },
      location,
      note,
    };
  }

  if (suggestion) {
    return {
      title: suggestion.suggestedTitle,
      dayIndex: String(getDayIndex(trip.startDate, suggestion.suggestedStartAt ?? trip.startDate)),
      time: toLocalTimeInputValue(suggestion.suggestedStartAt) || '09:00',
      endTime: {
        enabled: Boolean(suggestion.suggestedEndAt),
        value: toLocalTimeInputValue(suggestion.suggestedEndAt) || '',
      },
      location,
      note,
    };
  }

  const eventTime = getEventTime(trip, event);
  return {
    title: event.title,
    dayIndex: String(eventTime.dayIndex ?? 0),
    time: eventTime.startTime || '09:00',
    endTime: { enabled: Boolean(eventTime.endTime), value: eventTime.endTime ?? '' },
    location,
    note,
  };
}

interface ParsedTimes {
  startAt: number | null;
  endAt: number | null;
  dayIndex: number | null;
  startTime: string | null;
  endTime: string | null;
  error: string | null;
}

function parseTimes(trip: TripSpace, data: SuggestionFormData): ParsedTimes {
  const dayIndex = Number(data.dayIndex);
  const failure = (error: string): ParsedTimes => ({
    startAt: null,
    endAt: null,
    dayIndex: null,
    startTime: null,
    endTime: null,
    error,
  });

  if (isRelativeTrip(trip)) {
    if (!TIME_PATTERN.test(data.time)) {
      return failure('Choose a valid start time.');
    }
    if (!data.endTime.enabled) {
      return { startAt: null, endAt: null, dayIndex, startTime: data.time, endTime: null, error: null };
    }
    if (!TIME_PATTERN.test(data.endTime.value)) {
      return failure('Choose a valid end time, or remove it.');
    }
    if (data.endTime.value <= data.time) {
      return failure('The end time needs to be after the start time.');
    }
    return {
      startAt: null,
      endAt: null,
      dayIndex,
      startTime: data.time,
      endTime: data.endTime.value,
      error: null,
    };
  }

  const date = getDayInputValue(trip.startDate, dayIndex);
  const startAt = fromLocalDateAndTimeInputValues(date, data.time);
  if (startAt === undefined) {
    return failure('Choose a valid start time.');
  }

  const legacy = { dayIndex: null, startTime: null, endTime: null };
  if (!data.endTime.enabled) {
    return { ...legacy, startAt, endAt: null, error: null };
  }

  const endAt = fromLocalDateAndTimeInputValues(date, data.endTime.value);
  if (endAt === undefined) {
    return { ...legacy, startAt, endAt: null, error: 'Choose a valid end time, or remove it.' };
  }
  if (endAt <= startAt) {
    return { ...legacy, startAt, endAt, error: 'The end time needs to be after the start time.' };
  }

  return { ...legacy, startAt, endAt, error: null };
}

function EventSuggestionFormModal({
  isOpen,
  trip,
  event,
  suggestion,
  placeBias,
  isSubmitting = false,
  onSubmit,
  onClose,
}: EventSuggestionFormModalProps) {
  const initialData = useMemo(
    () => getInitialData(trip, event, suggestion),
    [trip, event, suggestion],
  );
  const [formData, setFormData] = useState<SuggestionFormData>(initialData);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const times = parseTimes(trip, formData);
  const isFormComplete = formData.title.trim() !== '' && formData.time !== '' && times.error === null;

  const fields = useMemo(
    () => [
      input({ name: 'title', label: 'Title', variant: 'outline' }),
      select({
        name: 'dayIndex',
        label: 'Day',
        options: getDayOptions(trip.startDate, trip.endDate, null, MAX_DAYS_OUTSIDE_TRIP).map(
          ({ value, label }) => ({ value, label }),
        ),
      }),
      createTimeInputField({ name: 'time', label: 'Start time', variant: 'outline' }),
      custom({
        name: 'endTime',
        label: 'End time',
        renderComponent: (props) => {
          const endTime = props.value as OptionalValue;

          if (!endTime.enabled) {
            return (
              <Button
                type='button'
                variant='link'
                size='sm'
                className='h-auto p-0 text-xs'
                onClick={() => props.onValueChange({ enabled: true, value: '' })}
              >
                + Add end time
              </Button>
            );
          }

          return (
            <div className='space-y-2'>
              <Input
                type='time'
                variant='outline'
                value={endTime.value}
                onChange={(changeEvent) =>
                  props.onValueChange({ enabled: true, value: changeEvent.target.value })
                }
              />
              <Button
                type='button'
                variant='link'
                size='sm'
                className='h-auto p-0 text-xs'
                onClick={() => props.onValueChange({ enabled: false, value: '' })}
              >
                Remove end time
              </Button>
            </div>
          );
        },
      }),
      custom({
        name: 'location',
        label: 'Location',
        renderComponent: (props) => {
          const location = props.value as SuggestedLocation;

          return (
            <PlaceAutocompleteInput
              quickSearch={{ label: 'Search by title', value: formData.title }}
              value={location.name}
              onChange={(name) => props.onValueChange({ ...location, name, ...UNLINKED_PLACE })}
              bias={placeBias}
              onSelect={(result: PlaceSelectionResult) =>
                props.onValueChange({
                  name: result.name,
                  address: result.address,
                  latitude: result.latitude,
                  longitude: result.longitude,
                  place: result.place,
                })
              }
              className='mb-0'
            />
          );
        },
      }),
      custom({
        name: 'note',
        label: 'Note',
        renderComponent: (props) => {
          const note = props.value as OptionalValue;

          return note.enabled ? (
            <Textarea
              rows={2}
              variant='outline'
              value={note.value}
              onChange={(changeEvent) =>
                props.onValueChange({ enabled: true, value: changeEvent.target.value })
              }
            />
          ) : (
            <Button
              type='button'
              variant='link'
              size='sm'
              className='h-auto p-0 text-xs'
              onClick={() => props.onValueChange({ enabled: true, value: '' })}
            >
              + Add note
            </Button>
          );
        },
      }),
    ],
    [trip.startDate, trip.endDate, formData.title, placeBias],
  );

  const handleSubmit = async (data: SuggestionFormData) => {
    const { startAt, endAt, dayIndex, startTime, endTime, error } = parseTimes(trip, data);
    if (error) {
      setSubmitError(error);
      return;
    }

    setSubmitError(null);
    try {
      await onSubmit({
        suggestedTitle: data.title,
        suggestedStartAt: startAt,
        suggestedEndAt: endAt,
        suggestedDayIndex: dayIndex,
        suggestedStartTime: startTime,
        suggestedEndTime: endTime,
        suggestedLocationName: data.location.name || null,
        suggestedAddress: data.location.address || null,
        suggestedLatitude: data.location.latitude,
        suggestedLongitude: data.location.longitude,
        suggestedPlace: data.location.place,
        note: data.note.enabled ? data.note.value || null : null,
      });
    } catch (error) {
      setSubmitError(getErrorMessage(error, 'Unable to send this suggestion.'));
    }
  };

  const displayedError = submitError ?? (formData.endTime.enabled ? times.error : null);

  return (
    <FormSheet isOpen={isOpen} onClose={onClose} title='Suggested change'>
      <Form
        id='waypoint-event-suggestion'
        form={fields}
        initialData={initialData}
        columns={1}
        onDataChange={(data) => setFormData(data as SuggestionFormData)}
        onSubmit={(data) => {
          void handleSubmit(data as SuggestionFormData);
        }}
        submitButton={
          <ModalFooterActions
            cancelAction={
                <Button type='button' variant='secondary' onClick={onClose} disabled={isSubmitting}>
                  Cancel
                </Button>
            }
            rightActions={
              <Button
                  type='submit'
                  loading={isSubmitting}
                  disabled={isSubmitting || !isFormComplete}
                >
                  {suggestion ? 'Save' : 'Suggest'}
                </Button>
            }
          />
        }
      />
      {displayedError && <p className='text-destructive mt-3 text-sm'>{displayedError}</p>}
    </FormSheet>
  );
}

export default EventSuggestionFormModal;

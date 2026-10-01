import { useMemo, useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Input,
  Modal,
  Textarea,
} from '@moondreamsdev/dreamer-ui/components';

import PlaceAutocompleteInput from '@/components/forms/PlaceAutocompleteInput';
import { UNLINKED_PLACE } from '@/lib/places/placesApi';
import type { PlaceSelectionBias, PlaceSelectionResult } from '@/lib/places/types';
import { fromLocalDateAndTimeInputValues, toLocalTimeInputValue } from '@/utils/dateInputUtils';
import { getDayCount, getDayIndex, getDayInputValue, getDayLabel } from '@/utils/dateRangeUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { createTimeInputField } from '@/utils/formFactoryHelpers';
import ModalFooterActions from '@apps/waypoint/components/ModalFooterActions';
import type { EventSuggestion, TimelineEvent, TripSpace } from '@apps/waypoint/types';

interface EventSuggestionFormModalProps {
  isOpen: boolean;
  trip: TripSpace;
  event: TimelineEvent;
  suggestion?: EventSuggestion;
  placeBias?: PlaceSelectionBias;
  isSubmitting?: boolean;
  onSubmit: (fields: {
    suggestedTitle: string;
    suggestedStartAt: number;
    suggestedEndAt: number | null;
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
  tripStartDate: number,
  event: TimelineEvent,
  suggestion?: EventSuggestion,
): SuggestionFormData {
  if (suggestion) {
    return {
      title: suggestion.suggestedTitle,
      dayIndex: String(getDayIndex(tripStartDate, suggestion.suggestedStartAt)),
      time: toLocalTimeInputValue(suggestion.suggestedStartAt) || '09:00',
      endTime: {
        enabled: Boolean(suggestion.suggestedEndAt),
        value: toLocalTimeInputValue(suggestion.suggestedEndAt) || '',
      },
      location: {
        name: suggestion.suggestedLocationName ?? '',
        address: suggestion.suggestedAddress ?? '',
        latitude: suggestion.suggestedLatitude,
        longitude: suggestion.suggestedLongitude,
        place: suggestion.suggestedPlace,
      },
      note: { enabled: Boolean(suggestion.note), value: suggestion.note ?? '' },
    };
  }

  return {
    title: event.title,
    dayIndex: String(event.dayIndex),
    time: toLocalTimeInputValue(event.startAt) || '09:00',
    endTime: { enabled: Boolean(event.endAt), value: toLocalTimeInputValue(event.endAt) || '' },
    location: {
      name: event.locationName ?? '',
      address: event.address ?? '',
      latitude: event.latitude,
      longitude: event.longitude,
      place: event.place,
    },
    note: { enabled: false, value: '' },
  };
}

function parseTimes(tripStartDate: number, data: SuggestionFormData) {
  const date = getDayInputValue(tripStartDate, Number(data.dayIndex));
  const startAt = fromLocalDateAndTimeInputValues(date, data.time);
  if (startAt === undefined) {
    return { startAt: null, endAt: null, error: 'Choose a valid start time.' };
  }
  if (!data.endTime.enabled) {
    return { startAt, endAt: null, error: null };
  }

  const endAt = fromLocalDateAndTimeInputValues(date, data.endTime.value);
  if (endAt === undefined) {
    return { startAt, endAt: null, error: 'Choose a valid end time, or remove it.' };
  }
  if (endAt <= startAt) {
    return { startAt, endAt, error: 'The end time needs to be after the start time.' };
  }

  return { startAt, endAt, error: null };
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
    () => getInitialData(trip.startDate, event, suggestion),
    [trip.startDate, event, suggestion],
  );
  const [formData, setFormData] = useState<SuggestionFormData>(initialData);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const dayCount = getDayCount(trip.startDate, trip.endDate);

  const times = parseTimes(trip.startDate, formData);
  const isFormComplete = formData.title.trim() !== '' && formData.time !== '' && times.error === null;

  const fields = useMemo(
    () => [
      input({ name: 'title', label: 'Title', variant: 'outline' }),
      select({
        name: 'dayIndex',
        label: 'Day',
        options: Array.from({ length: dayCount }, (_, index) => ({
          label: getDayLabel(trip.startDate, index),
          value: String(index),
        })),
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
    [dayCount, trip.startDate, formData.title, placeBias],
  );

  const handleSubmit = async (data: SuggestionFormData) => {
    const { startAt, endAt, error } = parseTimes(trip.startDate, data);
    if (startAt === null || error) {
      setSubmitError(error);
      return;
    }

    setSubmitError(null);
    try {
      await onSubmit({
        suggestedTitle: data.title,
        suggestedStartAt: startAt,
        suggestedEndAt: endAt,
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
    <Modal isOpen={isOpen} onClose={onClose} title='Suggested change'>
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
            rightActions={
              <>
                <Button type='button' variant='secondary' onClick={onClose} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button
                  type='submit'
                  loading={isSubmitting}
                  disabled={isSubmitting || !isFormComplete}
                >
                  {suggestion ? 'Save' : 'Suggest'}
                </Button>
              </>
            }
          />
        }
      />
      {displayedError && <p className='text-destructive mt-3 text-sm'>{displayedError}</p>}
    </Modal>
  );
}

export default EventSuggestionFormModal;

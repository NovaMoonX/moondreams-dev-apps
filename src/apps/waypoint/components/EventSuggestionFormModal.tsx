import { useState } from 'react';

import { Button, Input, Label, Modal, Select, Textarea } from '@moondreamsdev/dreamer-ui/components';

import PlaceAutocompleteInput from '@/components/forms/PlaceAutocompleteInput';
import { UNLINKED_PLACE } from '@/lib/places/placesApi';
import type { PlaceSelectionBias, PlaceSelectionResult } from '@/lib/places/types';
import { fromLocalDateAndTimeInputValues, toLocalTimeInputValue } from '@/utils/dateInputUtils';
import { getDayCount, getDayIndex, getDayInputValue, getDayLabel } from '@/utils/dateRangeUtils';
import { getErrorMessage } from '@/utils/errorUtils';
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

interface SuggestionDraft {
  title: string;
  dayIndex: number;
  time: string;
  hasEndTime: boolean;
  endTime: string;
  locationName: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  place: EventSuggestion['suggestedPlace'];
  hasNote: boolean;
  note: string;
}

function getInitialDraft(
  tripStartDate: number,
  event: TimelineEvent,
  suggestion?: EventSuggestion,
): SuggestionDraft {
  if (suggestion) {
    return {
      title: suggestion.suggestedTitle,
      dayIndex: getDayIndex(tripStartDate, suggestion.suggestedStartAt),
      time: toLocalTimeInputValue(suggestion.suggestedStartAt) || '09:00',
      hasEndTime: Boolean(suggestion.suggestedEndAt),
      endTime: toLocalTimeInputValue(suggestion.suggestedEndAt) || '',
      locationName: suggestion.suggestedLocationName ?? '',
      address: suggestion.suggestedAddress ?? '',
      latitude: suggestion.suggestedLatitude,
      longitude: suggestion.suggestedLongitude,
      place: suggestion.suggestedPlace,
      hasNote: Boolean(suggestion.note),
      note: suggestion.note ?? '',
    };
  }

  return {
    title: event.title,
    dayIndex: event.dayIndex,
    time: toLocalTimeInputValue(event.startAt) || '09:00',
    hasEndTime: Boolean(event.endAt),
    endTime: toLocalTimeInputValue(event.endAt) || '',
    locationName: event.locationName ?? '',
    address: event.address ?? '',
    latitude: event.latitude,
    longitude: event.longitude,
    place: event.place,
    hasNote: false,
    note: '',
  };
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
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<SuggestionDraft>(() =>
    getInitialDraft(trip.startDate, event, suggestion),
  );
  const dayCount = getDayCount(trip.startDate, trip.endDate);

  const updateDraft = (changes: Partial<SuggestionDraft>) =>
    setDraft((current) => ({ ...current, ...changes }));

  const handleSubmit = async () => {
    if (!draft.title.trim() || !draft.time) {
      setError('Enter a title, day, and start time.');
      return;
    }

    const startAt = fromLocalDateAndTimeInputValues(
      getDayInputValue(trip.startDate, draft.dayIndex),
      draft.time,
    );
    if (startAt === undefined) {
      setError('Choose a valid start time.');
      return;
    }
    const endAt = draft.hasEndTime
      ? fromLocalDateAndTimeInputValues(getDayInputValue(trip.startDate, draft.dayIndex), draft.endTime)
      : undefined;
    if (draft.hasEndTime && endAt === undefined) {
      setError('Choose a valid end time, or remove it.');
      return;
    }

    try {
      await onSubmit({
        suggestedTitle: draft.title,
        suggestedStartAt: startAt,
        suggestedEndAt: draft.hasEndTime ? (endAt as number) : null,
        suggestedLocationName: draft.locationName || null,
        suggestedAddress: draft.address || null,
        suggestedLatitude: draft.latitude,
        suggestedLongitude: draft.longitude,
        suggestedPlace: draft.place,
        note: draft.hasNote ? draft.note || null : null,
      });
      setError(null);
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to send this suggestion.'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='Suggested replacement'>
      <div className='space-y-4'>
        <div className='space-y-1.5'>
          <Label>Title</Label>
          <Input value={draft.title} onChange={(changeEvent) => updateDraft({ title: changeEvent.target.value })} />
        </div>
        <div className='space-y-1.5'>
          <Label>Day</Label>
          <Select
            options={Array.from({ length: dayCount }, (_, index) => ({
              text: getDayLabel(trip.startDate, index),
              value: String(index),
            }))}
            value={String(draft.dayIndex)}
            onChange={(value) => updateDraft({ dayIndex: Number(value) })}
          />
        </div>
        <div className='space-y-1.5'>
          <Label>Start time</Label>
          <Input
            type='time'
            value={draft.time}
            onChange={(changeEvent) => updateDraft({ time: changeEvent.target.value })}
          />
        </div>
        {draft.hasEndTime ? (
          <div className='space-y-1.5'>
            <div className='flex items-center justify-between'>
              <Label>End time</Label>
              <Button
                type='button'
                variant='tertiary'
                size='sm'
                className='h-auto p-0 text-xs'
                onClick={() => updateDraft({ hasEndTime: false, endTime: '' })}
              >
                Remove
              </Button>
            </div>
            <Input
              type='time'
              value={draft.endTime}
              onChange={(changeEvent) => updateDraft({ endTime: changeEvent.target.value })}
            />
          </div>
        ) : (
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            className='h-auto p-0 text-xs'
            onClick={() => updateDraft({ hasEndTime: true })}
          >
            + Add end time
          </Button>
        )}
        <PlaceAutocompleteInput
          label='Location'
          quickSearch={{ label: 'Search by title', value: draft.title }}
          value={draft.locationName}
          onChange={(locationName) => updateDraft({ locationName, ...UNLINKED_PLACE })}
          bias={placeBias}
          onSelect={(result: PlaceSelectionResult) =>
            updateDraft({
              locationName: result.name,
              address: result.address,
              latitude: result.latitude,
              longitude: result.longitude,
              place: result.place,
            })
          }
          className='mb-0'
        />
        {draft.hasNote ? (
          <div className='space-y-1.5'>
            <Label>Note</Label>
            <Textarea
              rows={2}
              value={draft.note}
              onChange={(changeEvent) => updateDraft({ note: changeEvent.target.value })}
            />
          </div>
        ) : (
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            className='h-auto p-0 text-xs'
            onClick={() => updateDraft({ hasNote: true })}
          >
            + Add note
          </Button>
        )}
        {error && <p className='text-destructive text-sm'>{error}</p>}
        <ModalFooterActions
          rightActions={
            <>
              <Button type='button' variant='secondary' onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type='button' loading={isSubmitting} onClick={() => void handleSubmit()}>
                {suggestion ? 'Save' : 'Suggest'}
              </Button>
            </>
          }
        />
      </div>
    </Modal>
  );
}

export default EventSuggestionFormModal;

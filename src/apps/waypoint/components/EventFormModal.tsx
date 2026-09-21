import { useState } from 'react';

import {
  Button,
  Checkbox,
  Input,
  Label,
  Modal,
  Select,
} from '@moondreamsdev/dreamer-ui/components';

import {
  fromLocalDateAndTimeInputValues,
  toLocalTimeInputValue,
} from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import type {
  ActivitySetting,
  EventDetails,
  EventType,
  MealType,
  TimelineEvent,
  TransitType,
  TripSpace,
} from '@apps/waypoint/types';
import {
  ACTIVITY_SETTING_LABELS,
  EVENT_TYPE_EMOJIS,
  EVENT_TYPE_LABELS,
  MEAL_TYPE_LABELS,
  TRANSIT_TYPE_LABELS,
} from '@apps/waypoint/constants';
import { getDayCount, getDayInputValue, getDayLabel } from '@/utils/dateRangeUtils';

interface EventFormModalProps {
  isOpen: boolean;
  trip: TripSpace;
  memberOptions: { label: string; value: string }[];
  event?: TimelineEvent;
  isSubmitting?: boolean;
  onSubmit: (
    event: Omit<TimelineEvent, 'id' | 'tripId' | 'createdBy' | 'createdAt' | 'lastEditedAt'>,
  ) => Promise<void> | void;
  onClose: () => void;
}

function toSelectOptions<T extends string>(labels: Record<T, string>) {
  return Object.entries(labels).map(([value, text]) => ({ value, text: text as string }));
}

const eventTypeOptions = Object.entries(EVENT_TYPE_LABELS).map(([value, text]) => ({
  value,
  text: `${EVENT_TYPE_EMOJIS[value as EventType]} ${text}`,
}));
const transitTypeOptions = toSelectOptions(TRANSIT_TYPE_LABELS);
const mealTypeOptions = toSelectOptions(MEAL_TYPE_LABELS);
const activitySettingOptions = toSelectOptions(ACTIVITY_SETTING_LABELS);

interface EventDraft {
  eventType: EventType;
  title: string;
  dayIndex: number;
  endDayIndex: number;
  time: string;
  quickField: string;
  locationName: string;
  address: string;
  assignedMemberIds: string[];
}

function getInitialDraft(event: TimelineEvent | undefined): EventDraft {
  return {
    eventType: event?.eventType ?? 'ACTIVITY',
    title: event?.title ?? '',
    dayIndex: event?.dayIndex ?? 0,
    endDayIndex: event?.endDayIndex ?? event?.dayIndex ?? 0,
    time: toLocalTimeInputValue(event?.startAt) || '09:00',
    quickField:
      event?.eventType === 'TRAVEL' && event.eventDetails && 'transitType' in event.eventDetails
        ? event.eventDetails.transitType
        : event?.eventType === 'DINING' && event.eventDetails && 'mealType' in event.eventDetails
          ? event.eventDetails.mealType
          : event?.eventType === 'ACTIVITY' &&
              event.eventDetails &&
              'settings' in event.eventDetails
            ? event.eventDetails.settings[0] ?? 'INDOOR'
            : 'INDOOR',
    locationName: event?.locationName ?? '',
    address: event?.address ?? '',
    assignedMemberIds: event?.assignedMemberIds ?? [],
  };
}

function EventFormModal({
  isOpen,
  trip,
  memberOptions,
  event,
  isSubmitting = false,
  onSubmit,
  onClose,
}: EventFormModalProps) {
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<EventDraft>(() => getInitialDraft(event));
  const dayCount = getDayCount(trip.startDate, trip.endDate);

  const updateDraft = (changes: Partial<EventDraft>) =>
    setDraft((current) => ({ ...current, ...changes }));

  const handleNext = () => {
    if (!draft.title.trim() || !draft.time) {
      setError('Enter a title, day, and start time.');
      return;
    }
    setError(null);
    setStep(2);
  };

  const handleSubmit = async () => {
    const date = getDayInputValue(trip.startDate, draft.dayIndex);
    const startAt = fromLocalDateAndTimeInputValues(date, draft.time);
    if (startAt === undefined) {
      setError('Choose a valid start time.');
      return;
    }

    let eventDetails: EventDetails;
    if (draft.eventType === 'TRAVEL') {
      eventDetails = { transitType: draft.quickField as TransitType };
    } else if (draft.eventType === 'DINING') {
      eventDetails = { mealType: draft.quickField as MealType };
    } else if (draft.eventType === 'ACTIVITY') {
      eventDetails = { settings: [draft.quickField as ActivitySetting] };
    } else {
      eventDetails = {};
    }

    try {
      await onSubmit({
        eventType: draft.eventType,
        dayIndex: draft.dayIndex,
        endDayIndex: Math.max(draft.dayIndex, draft.endDayIndex),
        title: draft.title,
        startAt,
        endAt: event?.endAt ?? null,
        locationName: draft.locationName,
        address: draft.address,
        latitude: event?.latitude ?? null,
        longitude: event?.longitude ?? null,
        eventDetails,
        notes: event?.notes ?? null,
        assignedMemberIds: draft.assignedMemberIds,
      });
      setStep(1);
      setError(null);
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save this event.'));
    }
  };

  const quickLabel =
    draft.eventType === 'TRAVEL'
      ? 'Transit type'
      : draft.eventType === 'DINING'
        ? 'Meal type'
        : 'Setting';
  const quickOptions =
    draft.eventType === 'TRAVEL'
      ? transitTypeOptions
      : draft.eventType === 'DINING'
        ? mealTypeOptions
        : activitySettingOptions;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='Timeline event'>
      <div className='space-y-4'>
        <p className='text-muted-foreground text-sm'>Step {step} of 2</p>
        {step === 1 ? (
          <>
            <div className='space-y-1.5'>
              <Label>Event type</Label>
              <Select
                options={eventTypeOptions}
                value={draft.eventType}
                onChange={(value) => updateDraft({ eventType: value as EventType })}
              />
            </div>
            <div className='space-y-1.5'>
              <Label>Title</Label>
              <Input
                value={draft.title}
                placeholder='Dinner at Ichiran'
                onChange={(event) => updateDraft({ title: event.target.value })}
              />
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
                onChange={(event) => updateDraft({ time: event.target.value })}
              />
            </div>
            <div className='space-y-1.5'>
              <Label>End day</Label>
              <Select
                options={Array.from({ length: dayCount }, (_, index) => ({
                  text: getDayLabel(trip.startDate, index),
                  value: String(index),
                }))}
                value={String(draft.endDayIndex)}
                onChange={(value) => updateDraft({ endDayIndex: Number(value) })}
              />
            </div>
            <div className='flex justify-end gap-2'>
              <Button type='button' variant='secondary' onClick={onClose}>
                Cancel
              </Button>
              <Button type='button' onClick={handleNext}>
                Next
              </Button>
            </div>
          </>
        ) : (
          <>
            {draft.eventType !== 'FREE_TIME' && (
              <div className='space-y-1.5'>
                <Label>{quickLabel}</Label>
                <Select
                  options={quickOptions}
                  value={draft.quickField}
                  onChange={(value) => updateDraft({ quickField: value })}
                />
              </div>
            )}
            <div className='space-y-1.5'>
              <Label>Location</Label>
              <Input
                placeholder='Ichiran Shibuya'
                value={draft.locationName}
                onChange={(event) => updateDraft({ locationName: event.target.value })}
              />
            </div>
            <div className='space-y-1.5'>
              <Label>Address</Label>
              <Input
                placeholder='Location address (optional)'
                value={draft.address}
                onChange={(event) => updateDraft({ address: event.target.value })}
              />
            </div>
            <div className='space-y-2'>
              <Label>Assignees</Label>
              {memberOptions.map((member) => (
                <label key={member.value} className='flex items-center gap-2 text-sm'>
                  <Checkbox
                    checked={draft.assignedMemberIds.includes(member.value)}
                    onCheckedChange={(checked) =>
                      updateDraft({
                        assignedMemberIds: checked
                          ? [...draft.assignedMemberIds, member.value]
                          : draft.assignedMemberIds.filter((uid) => uid !== member.value),
                      })
                    }
                  />
                  {member.label}
                </label>
              ))}
            </div>
            <div className='flex justify-between gap-2'>
              <Button type='button' variant='secondary' onClick={() => setStep(1)}>
                Back
              </Button>
              <Button type='button' loading={isSubmitting} onClick={() => void handleSubmit()}>
                {isSubmitting ? 'Saving…' : event ? 'Save changes' : 'Add event'}
              </Button>
            </div>
          </>
        )}
        {error && <p className='text-destructive text-sm'>{error}</p>}
      </div>
    </Modal>
  );
}

export default EventFormModal;

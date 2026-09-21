import { useState } from 'react';

import {
  Button,
  Checkbox,
  Input,
  Label,
  Modal,
  Select,
} from '@moondreamsdev/dreamer-ui/components';

import { fromLocalDateAndTimeInputValues } from '@/utils/dateInputUtils';
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
  EVENT_TYPE_LABELS,
  MEAL_TYPE_LABELS,
  TRANSIT_TYPE_LABELS,
} from '@apps/waypoint/constants';
import { getDayInputValue, getDayLabel, getTripDayCount } from '@apps/waypoint/utils/dateUtils';

interface EventFormModalProps {
  isOpen: boolean;
  trip: TripSpace;
  isSubmitting?: boolean;
  onSubmit: (
    event: Omit<TimelineEvent, 'id' | 'tripId' | 'createdBy' | 'createdAt' | 'lastEditedAt'>,
  ) => Promise<void> | void;
  onClose: () => void;
}

const eventTypeOptions = Object.entries(EVENT_TYPE_LABELS).map(([value, text]) => ({ value, text }));
const transitTypeOptions = Object.entries(TRANSIT_TYPE_LABELS).map(([value, text]) => ({ value, text }));
const mealTypeOptions = Object.entries(MEAL_TYPE_LABELS).map(([value, text]) => ({ value, text }));
const activitySettingOptions = Object.entries(ACTIVITY_SETTING_LABELS).map(([value, text]) => ({ value, text }));

interface EventDraft {
  eventType: EventType;
  title: string;
  dayIndex: number;
  date: string;
  time: string;
  quickField: string;
  locationName: string;
  address: string;
  assignedMemberIds: string[];
}

function EventFormModal({
  isOpen,
  trip,
  isSubmitting = false,
  onSubmit,
  onClose,
}: EventFormModalProps) {
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<EventDraft>({
    eventType: 'ACTIVITY',
    title: '',
    dayIndex: 0,
    date: getDayInputValue(trip.startDate, 0),
    time: '09:00',
    quickField: 'INDOOR',
    locationName: '',
    address: '',
    assignedMemberIds: [],
  });
  const dayCount = getTripDayCount(trip.startDate, trip.endDate);

  const updateDraft = (changes: Partial<EventDraft>) =>
    setDraft((current) => ({ ...current, ...changes }));

  const handleNext = () => {
    if (!draft.title.trim() || !draft.date || !draft.time) {
      setError('Enter a title, day, and start time.');
      return;
    }
    setError(null);
    setStep(2);
  };

  const handleSubmit = async () => {
    const startAt = fromLocalDateAndTimeInputValues(draft.date, draft.time);
    if (startAt === undefined) {
      setError('Choose a valid start date and time.');
      return;
    }

    let eventDetails: EventDetails | null = null;
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
        endDayIndex: draft.dayIndex,
        title: draft.title,
        startAt,
        endAt: null,
        locationName: draft.locationName,
        address: draft.address,
        latitude: null,
        longitude: null,
        eventDetails,
        notes: null,
        assignedMemberIds: draft.assignedMemberIds,
      });
      setStep(1);
      setError(null);
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to add this event.'));
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
    <Modal isOpen={isOpen} onClose={onClose} title='Add timeline event'>
      <div className='space-y-4'>
        <p className='text-muted-foreground text-sm'>Step {step} of 2</p>
        {step === 1 ? (
          <>
            <Select
              label='Event type'
              options={eventTypeOptions}
              value={draft.eventType}
              onChange={(value) => updateDraft({ eventType: value as EventType })}
            />
            <Input
              label='Title'
              value={draft.title}
              placeholder='Dinner at Ichiran'
              onChange={(event) => updateDraft({ title: event.target.value })}
            />
            <Select
              label='Day'
              options={Array.from({ length: dayCount }, (_, index) => ({
                text: getDayLabel(trip.startDate, index),
                value: String(index),
              }))}
              value={String(draft.dayIndex)}
              onChange={(value) =>
                updateDraft({
                  dayIndex: Number(value),
                  date: getDayInputValue(trip.startDate, Number(value)),
                })
              }
            />
            <Input
              label='Start date'
              type='date'
              value={draft.date}
              onChange={(event) => updateDraft({ date: event.target.value })}
            />
            <Input
              label='Start time'
              type='time'
              value={draft.time}
              onChange={(event) => updateDraft({ time: event.target.value })}
            />
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
              <Select
                label={quickLabel}
                options={quickOptions}
                value={draft.quickField}
                onChange={(value) => updateDraft({ quickField: value })}
              />
            )}
            <Input
              label='Location'
              placeholder='Ichiran Shibuya'
              value={draft.locationName}
              onChange={(event) => updateDraft({ locationName: event.target.value })}
            />
            <Input
              label='Address'
              placeholder='Location address (optional)'
              value={draft.address}
              onChange={(event) => updateDraft({ address: event.target.value })}
            />
            <div className='space-y-2'>
              <Label>Assignees</Label>
              {Object.values(trip.members).map((member) => (
                <label key={member.uid} className='flex items-center gap-2 text-sm'>
                  <Checkbox
                    checked={draft.assignedMemberIds.includes(member.uid)}
                    onCheckedChange={(checked) =>
                      updateDraft({
                        assignedMemberIds: checked
                          ? [...draft.assignedMemberIds, member.uid]
                          : draft.assignedMemberIds.filter((uid) => uid !== member.uid),
                      })
                    }
                  />
                  {member.uid}
                </label>
              ))}
            </div>
            <div className='flex justify-between gap-2'>
              <Button type='button' variant='secondary' onClick={() => setStep(1)}>
                Back
              </Button>
              <Button type='button' loading={isSubmitting} onClick={() => void handleSubmit()}>
                {isSubmitting ? 'Adding…' : 'Add event'}
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

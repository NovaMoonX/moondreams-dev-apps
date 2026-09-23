import { useState } from 'react';

import {
  Button,
  Checkbox,
  Input,
  Label,
  Modal,
  Select,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { X } from 'lucide-react';

import LinkAttachField from '@/components/forms/LinkAttachField';
import PlaceAutocompleteInput from '@/components/forms/PlaceAutocompleteInput';
import type { LinkPreview } from '@/lib/linkMetadata/types';
import { UNLINKED_PLACE } from '@/lib/places/placesApi';
import type {
  PlaceRef,
  PlaceSelectionBias,
  PlaceSelectionResult,
} from '@/lib/places/types';
import {
  fromLocalDateAndTimeInputValues,
  toLocalTimeInputValue,
} from '@/utils/dateInputUtils';
import {
  getDayCount,
  getDayInputValue,
  getDayLabel,
} from '@/utils/dateRangeUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatTime } from '@/utils/formatUtils';
import DeleteIconButton from '@apps/waypoint/components/DeleteIconButton';
import ModalFooterActions from '@apps/waypoint/components/ModalFooterActions';
import {
  ACTIVITY_SETTING_LABELS,
  DEFAULT_REMINDER_MINUTES_BEFORE,
  EVENT_TYPE_EMOJIS,
  EVENT_TYPE_LABELS,
  MEAL_TYPE_LABELS,
  REMINDER_MINUTES_BEFORE_OPTIONS,
  TRANSIT_TYPE_LABELS,
} from '@apps/waypoint/constants';
import type {
  ActivitySetting,
  EventDetails,
  EventType,
  MealType,
  TimelineEvent,
  TransitType,
  TripSpace,
} from '@apps/waypoint/types';

interface EventFormModalProps {
  isOpen: boolean;
  trip: TripSpace;
  memberOptions: { label: string; value: string }[];
  event?: TimelineEvent;
  /** A rough center point (from an existing trip event/stay) to bias place search
   * results toward, so "starbucks" finds the one near this trip first. */
  placeBias?: PlaceSelectionBias;
  isSubmitting?: boolean;
  onSubmit: (
    event: Omit<
      TimelineEvent,
      'id' | 'tripId' | 'createdBy' | 'createdAt' | 'lastEditedAt'
    >,
  ) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onClose: () => void;
}

function toSelectOptions<T extends string>(labels: Record<T, string>) {
  return Object.entries(labels).map(([value, text]) => ({
    value,
    text: text as string,
  }));
}

const eventTypeOptions = Object.entries(EVENT_TYPE_LABELS).map(
  ([value, text]) => ({
    value,
    text: `${EVENT_TYPE_EMOJIS[value as EventType]} ${text}`,
  }),
);
const transitTypeOptions = toSelectOptions(TRANSIT_TYPE_LABELS);
const mealTypeOptions = toSelectOptions(MEAL_TYPE_LABELS);
const activitySettingOptions = toSelectOptions(ACTIVITY_SETTING_LABELS);
const reminderOptions = [
  { value: 'off', text: "Don't remind me" },
  ...REMINDER_MINUTES_BEFORE_OPTIONS.map((minutes) => ({
    value: String(minutes),
    text: `${minutes} minutes before`,
  })),
];

interface EventDraft {
  eventType: EventType;
  title: string;
  dayIndex: number;
  endDayIndex: number;
  hasEndTime: boolean;
  time: string;
  endTime: string;
  quickField: string;
  locationName: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  place: PlaceRef | null;
  linkUrl: string;
  linkPreview: LinkPreview | null;
  assignedMemberIds: string[];
  reminderMinutesBefore: number;
  reminderEnabled: boolean;
}

/** Only these event types carry a bookable link (dining reservations, activity
 * tickets); travel and free time don't have a natural "booking" to attach. */
const LINK_ATTACHABLE_EVENT_TYPES: readonly EventType[] = [
  'DINING',
  'ACTIVITY',
];

function getInitialDraft(event: TimelineEvent | undefined): EventDraft {
  return {
    eventType: event?.eventType ?? 'ACTIVITY',
    title: event?.title ?? '',
    dayIndex: event?.dayIndex ?? 0,
    endDayIndex: event?.endDayIndex ?? event?.dayIndex ?? 0,
    hasEndTime: Boolean(event?.endAt),
    time: toLocalTimeInputValue(event?.startAt) || '09:00',
    endTime: toLocalTimeInputValue(event?.endAt) || '',
    quickField:
      event?.eventType === 'TRAVEL' &&
      event.eventDetails &&
      'transitType' in event.eventDetails
        ? event.eventDetails.transitType
        : event?.eventType === 'DINING' &&
            event.eventDetails &&
            'mealType' in event.eventDetails
          ? event.eventDetails.mealType
          : event?.eventType === 'ACTIVITY' &&
              event.eventDetails &&
              'settings' in event.eventDetails
            ? (event.eventDetails.settings[0] ?? 'INDOOR')
            : 'INDOOR',
    locationName: event?.locationName ?? '',
    address: event?.address ?? '',
    latitude: event?.latitude ?? null,
    longitude: event?.longitude ?? null,
    place: event?.place ?? null,
    linkUrl: event?.linkUrl ?? '',
    linkPreview: event?.linkPreview ?? null,
    assignedMemberIds: event?.assignedMemberIds ?? [],
    reminderMinutesBefore:
      event?.reminderMinutesBefore ?? DEFAULT_REMINDER_MINUTES_BEFORE,
    reminderEnabled: event?.reminderEnabled ?? true,
  };
}

function EventFormModal({
  isOpen,
  trip,
  memberOptions,
  event,
  placeBias,
  isSubmitting = false,
  onSubmit,
  onDelete,
  onClose,
}: EventFormModalProps) {
  const { confirm } = useActionModal();
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
    if (draft.hasEndTime && !draft.endTime) {
      setError('Enter an end time, or remove the end time.');
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

    const endAt = draft.hasEndTime
      ? fromLocalDateAndTimeInputValues(
          getDayInputValue(trip.startDate, draft.endDayIndex),
          draft.endTime,
        )
      : undefined;
    if (draft.hasEndTime && endAt === undefined) {
      setError('Choose a valid end time.');
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
        endDayIndex: draft.hasEndTime
          ? Math.max(draft.dayIndex, draft.endDayIndex)
          : draft.dayIndex,
        title: draft.title,
        startAt,
        endAt: draft.hasEndTime ? (endAt as number) : null,
        locationName: draft.locationName,
        address: draft.address,
        latitude: draft.latitude,
        longitude: draft.longitude,
        eventDetails,
        notes: event?.notes ?? null,
        assignedMemberIds: draft.assignedMemberIds,
        changeHistory: event?.changeHistory ?? [],
        place: draft.place,
        linkUrl: LINK_ATTACHABLE_EVENT_TYPES.includes(draft.eventType)
          ? draft.linkUrl
          : null,
        linkPreview: LINK_ATTACHABLE_EVENT_TYPES.includes(draft.eventType)
          ? draft.linkPreview
          : null,
        reminderMinutesBefore: draft.reminderMinutesBefore,
        reminderEnabled: draft.reminderEnabled,
        reminderId: event?.reminderId ?? null,
      });
      setStep(1);
      setError(null);
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save this event.'));
    }
  };

  const handleDelete = async () => {
    if (!onDelete) {
      return;
    }

    const confirmed = await confirm({
      title: 'Delete timeline event',
      message: `Delete "${event?.title}"? This action cannot be undone.`,
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    await onDelete();
  };

  const draftStartAt = fromLocalDateAndTimeInputValues(
    getDayInputValue(trip.startDate, draft.dayIndex),
    draft.time,
  );
  const reminderAt =
    draft.reminderEnabled && draftStartAt !== undefined
      ? draftStartAt - draft.reminderMinutesBefore * 60_000
      : null;

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
                onChange={(value) =>
                  updateDraft({ eventType: value as EventType })
                }
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
            {draft.hasEndTime ? (
              <div className='space-y-1.5'>
                <div className='flex items-center justify-between'>
                  <Label>End day &amp; time</Label>
                  <Button
                    type='button'
                    variant='tertiary'
                    size='icon'
                    aria-label='Remove end time'
                    onClick={() =>
                      updateDraft({
                        hasEndTime: false,
                        endDayIndex: draft.dayIndex,
                        endTime: '',
                      })
                    }
                  >
                    <X className='h-4 w-4' />
                  </Button>
                </div>
                <div className='grid gap-3 sm:grid-cols-2'>
                  <Select
                    options={Array.from({ length: dayCount }, (_, index) => ({
                      text: getDayLabel(trip.startDate, index),
                      value: String(index),
                    }))}
                    value={String(draft.endDayIndex)}
                    onChange={(value) =>
                      updateDraft({ endDayIndex: Number(value) })
                    }
                  />
                  <Input
                    type='time'
                    value={draft.endTime}
                    onChange={(event) =>
                      updateDraft({ endTime: event.target.value })
                    }
                  />
                </div>
              </div>
            ) : (
              <Button
                type='button'
                variant='link'
                size='sm'
                className='h-auto p-0'
                onClick={() => updateDraft({ hasEndTime: true })}
              >
                + Add end time
              </Button>
            )}
            <ModalFooterActions
              leftActions={
                event &&
                onDelete && (
                  <DeleteIconButton
                    onClick={() => void handleDelete()}
                    disabled={isSubmitting}
                  />
                )
              }
              rightActions={
                <>
                  <Button type='button' variant='secondary' onClick={onClose}>
                    Cancel
                  </Button>
                  <Button type='button' onClick={handleNext}>
                    Next
                  </Button>
                </>
              }
            />
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
            <PlaceAutocompleteInput
              label='Location'
              quickSearch={{ label: 'Search by title', value: draft.title }}
              placeholder='Ichiran Shibuya'
              value={draft.locationName}
              onChange={(locationName) =>
                updateDraft({ locationName, ...UNLINKED_PLACE })
              }
              bias={placeBias}
              onSelect={(result: PlaceSelectionResult) =>
                updateDraft({
                  title: draft.title.trim() ? draft.title : result.name,
                  locationName: result.name,
                  address: result.address,
                  latitude: result.latitude,
                  longitude: result.longitude,
                  place: result.place,
                })
              }
            />
            <div className='space-y-1.5'>
              <Label>Address</Label>
              <Input
                placeholder='Street address'
                value={draft.address}
                onChange={(event) =>
                  updateDraft({
                    address: event.target.value,
                    ...UNLINKED_PLACE,
                  })
                }
              />
            </div>
            {LINK_ATTACHABLE_EVENT_TYPES.includes(draft.eventType) && (
              <LinkAttachField
                url={draft.linkUrl}
                preview={draft.linkPreview}
                label='Booking, reservation, or website link'
                addLabel='+ Add booking or website link'
                placeholder='https://…'
                onChange={(linkUrl, linkPreview) =>
                  updateDraft({ linkUrl, linkPreview })
                }
                currentTitle={draft.title}
                onUseTitle={(title) => updateDraft({ title })}
              />
            )}
            <div className='space-y-1.5'>
              <Label>Reminder</Label>
              <Select
                options={reminderOptions}
                value={draft.reminderEnabled ? String(draft.reminderMinutesBefore) : 'off'}
                onChange={(value) =>
                  value === 'off'
                    ? updateDraft({ reminderEnabled: false })
                    : updateDraft({ reminderEnabled: true, reminderMinutesBefore: Number(value) })
                }
              />
              {reminderAt !== null && (
                <p className='text-muted-foreground text-xs'>
                  Will remind at {formatTime(reminderAt)}
                </p>
              )}
            </div>
            <div className='space-y-2'>
              <Label>Attendees</Label>
              {memberOptions.map((member) => (
                <label
                  key={member.value}
                  className='flex items-center gap-2 text-sm'
                >
                  <Checkbox
                    checked={draft.assignedMemberIds.includes(member.value)}
                    onCheckedChange={(checked) =>
                      updateDraft({
                        assignedMemberIds: checked
                          ? [...draft.assignedMemberIds, member.value]
                          : draft.assignedMemberIds.filter(
                              (uid) => uid !== member.value,
                            ),
                      })
                    }
                  />
                  {member.label}
                </label>
              ))}
            </div>
            <ModalFooterActions
              leftActions={
                <>
                  {event && onDelete && (
                    <DeleteIconButton
                      onClick={() => void handleDelete()}
                      disabled={isSubmitting}
                    />
                  )}
                  <Button
                    type='button'
                    variant='secondary'
                    onClick={() => setStep(1)}
                  >
                    Back
                  </Button>
                </>
              }
              rightActions={
                <Button
                  type='button'
                  loading={isSubmitting}
                  onClick={() => void handleSubmit()}
                >
                  {isSubmitting
                    ? 'Saving…'
                    : event
                      ? 'Save changes'
                      : 'Add event'}
                </Button>
              }
            />
          </>
        )}
        {error && <p className='text-destructive text-sm'>{error}</p>}
      </div>
    </Modal>
  );
}

export default EventFormModal;

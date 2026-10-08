import { createAsyncThunk } from '@reduxjs/toolkit';
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  runTransaction,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import type {
  EventChangeSnapshot,
  EventDetails,
  EventFieldChange,
  EventType,
  TimelineEvent,
  TripSpace,
} from '@apps/waypoint/types';
import { ARRIVE_BY_EVENT_TYPES, DEFAULT_REMINDER_MINUTES_BEFORE } from '@apps/waypoint/constants';
import {
  cancelEventReminder,
  type EventReminderSource,
  scheduleEventReminder,
} from '@apps/waypoint/utils/reminders';
import { getEventTime, isRelativeTrip } from '@apps/waypoint/utils/tripTime';
import { canArchiveEvent, canCreateItem, canEditExistingItem, isTripActive } from '@apps/waypoint/utils/roleGuards';

interface CreateEventInput {
  uid: string;
  trip: TripSpace;
  event: EventFields & { eventDetails: EventDetails | null; eventType: EventType };
}

export type EventFields = Omit<
  TimelineEvent,
  'id' | 'tripId' | 'createdBy' | 'createdAt' | 'lastEditedAt'
>;

interface UpdateEventInput {
  uid: string;
  trip: TripSpace;
  eventId: string;
  event: TimelineEvent;
  previousEvent: TimelineEvent;
}

interface DeleteEventInput {
  uid: string;
  trip: TripSpace;
  eventId: string;
}

const CONCURRENTLY_WRITTEN_EVENT_FIELDS = [
  'seenBy',
  'isArchived',
  'archivedBy',
  'archivedAt',
  'changeHistory',
];

const ABSOLUTE_TRACKED_FIELDS = ['startAt', 'endAt', 'locationName', 'dayIndex', 'endDayIndex'] as const;
const RELATIVE_TRACKED_FIELDS = ['startTime', 'endTime', 'arriveByTime', 'locationName', 'dayIndex', 'endDayIndex'] as const;

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// Clock times in two zones can't be compared as text (a flight can land at an earlier clock time than it left).
function isEndAfterStartAcrossZones(trip: TripSpace, event: EventFields) {
  const { startMs, endMs } = getEventTime(trip, event);
  return startMs === null || endMs === null || endMs > startMs;
}

/** Arriving at the start time says nothing, so an arrival has to come strictly before it, on the same day. */
function validateArriveBy(event: Pick<EventFields, 'eventType' | 'startTime' | 'arriveByTime' | 'arriveByNote'>) {
  if (event.arriveByTime === null) {
    return event.arriveByNote === null ? null : 'Add an arrival time for that note, or remove the note.';
  }
  if (!ARRIVE_BY_EVENT_TYPES.includes(event.eventType)) {
    return 'Only dining and activities can have an arrival time.';
  }
  if (!TIME_PATTERN.test(event.arriveByTime) || event.startTime === null) {
    return 'Choose a valid arrival time.';
  }
  return event.arriveByTime < event.startTime ? null : 'The arrival needs to be before the start time.';
}

export function validateEventTime(trip: TripSpace, event: EventFields) {
  const message = 'Choose a valid event date and time.';
  if (!isRelativeTrip(trip)) {
    const isValid = event.startAt !== null && Number.isFinite(event.startAt);
    return isValid ? null : message;
  }

  const hasValidStart = event.startTime !== null && TIME_PATTERN.test(event.startTime);
  const hasValidEnd = event.endTime === null || TIME_PATTERN.test(event.endTime);
  const isRangeOrdered =
    event.dayIndex === null ||
    event.endDayIndex === null ||
    event.endDayIndex >= event.dayIndex;
  const hasOwnEndZone = event.endTime !== null && (event.endTimezone ?? event.timezone) !== event.timezone;
  const endsAfterStart = hasOwnEndZone
    ? isEndAfterStartAcrossZones(trip, event)
    : event.endTime === null ||
      event.startTime === null ||
      (event.endDayIndex ?? event.dayIndex) !== event.dayIndex ||
      event.endTime > event.startTime;
  if (!endsAfterStart) {
    return 'The end time needs to be after the start time.';
  }
  const arriveByError = validateArriveBy(event);
  if (arriveByError) {
    return arriveByError;
  }
  return hasValidStart && hasValidEnd && isRangeOrdered ? null : message;
}

function buildChangeSnapshot(
  trip: TripSpace,
  previousEvent: TimelineEvent,
  nextEvent: TimelineEvent,
  uid: string,
): EventChangeSnapshot | null {
  const now = Date.now();
  const trackedFields: readonly EventFieldChange['field'][] = isRelativeTrip(trip)
    ? RELATIVE_TRACKED_FIELDS
    : ABSOLUTE_TRACKED_FIELDS;
  const changes: EventFieldChange[] = trackedFields
    .filter((field) => (previousEvent[field] ?? null) !== (nextEvent[field] ?? null))
    .map((field) => ({
      field,
      previousValue: previousEvent[field] ?? null,
      changedBy: uid,
      changedAt: now,
    }));

  if (changes.length === 0) {
    return null;
  }

  return { changes, latestChangedBy: uid, latestChangedAt: now };
}

async function resolveEventReminderId(
  trip: TripSpace,
  uid: string,
  previousEvent: TimelineEvent,
  nextEvent: EventReminderSource,
): Promise<string | null> {
  const startChanged = (['startAt', 'dayIndex', 'startTime', 'timezone'] as const).some(
    (field) => (previousEvent[field] ?? null) !== (nextEvent[field] ?? null),
  );
  const minutesChanged = previousEvent.reminderMinutesBefore !== nextEvent.reminderMinutesBefore;
  const enabledChanged = previousEvent.reminderEnabled !== nextEvent.reminderEnabled;

  if (previousEvent.reminderId && (startChanged || minutesChanged || enabledChanged)) {
    await cancelEventReminder(previousEvent.reminderId);
  }

  if (!nextEvent.reminderEnabled) {
    return null;
  }

  const shouldReschedule =
    startChanged || minutesChanged || enabledChanged || !previousEvent.reminderId;
  if (!shouldReschedule) {
    return previousEvent.reminderId;
  }

  return scheduleEventReminder({ trip, uid, event: nextEvent });
}

export const createEvent = createAsyncThunk<
  TimelineEvent,
  CreateEventInput,
  { rejectValue: string }
>('waypoint/events/create', async ({ uid, trip, event }, { rejectWithValue }) => {
  if (!canCreateItem(trip, uid)) {
    return rejectWithValue('You do not have permission to add timeline events.');
  }
  if (!event.title.trim()) {
    return rejectWithValue('Event title is required.');
  }
  const timeError = validateEventTime(trip, event);
  if (timeError) {
    return rejectWithValue(timeError);
  }

  const eventRef = doc(collection(db, 'apps', 'waypoint', 'trips', trip.id, 'events'));
  const now = Date.now();
  const trimmedTitle = event.title.trim();
  const reminderId = await scheduleEventReminder({
    trip,
    uid,
    event: {
      id: eventRef.id,
      title: trimmedTitle,
      dayIndex: event.dayIndex,
      endDayIndex: event.endDayIndex,
      startAt: event.startAt,
      endAt: event.endAt,
      startTime: event.startTime,
      endTime: event.endTime,
      timezone: event.timezone,
      reminderMinutesBefore: event.reminderMinutesBefore,
      reminderEnabled: event.reminderEnabled,
      assignedMemberIds: event.assignedMemberIds,
    },
  });
  const createdEvent: TimelineEvent = {
    ...event,
    id: eventRef.id,
    tripId: trip.id,
    title: trimmedTitle,
    locationName: event.locationName?.trim() || null,
    address: event.address?.trim() || null,
    linkUrl: event.linkUrl?.trim() || null,
    linkPreview: event.linkUrl?.trim() ? event.linkPreview : null,
    linkKind: event.linkUrl?.trim() ? event.linkKind : null,
    groupLabel: event.groupLabel?.trim() || null,
    stackLabel: event.stackLabel?.trim() || null,
    notes: null,
    changeHistory: [],
    reminderId,
    isArchived: false,
    archivedBy: null,
    archivedAt: null,
    seenBy: { [uid]: now },
    createdBy: uid,
    createdAt: now,
    lastEditedAt: now,
  };

  await setDoc(eventRef, createdEvent);
  return createdEvent;
});

export const updateEvent = createAsyncThunk<
  TimelineEvent,
  UpdateEventInput,
  { rejectValue: string }
>(
  'waypoint/events/update',
  async ({ uid, trip, eventId, event, previousEvent }, { rejectWithValue }) => {
    if (!canEditExistingItem(trip, uid)) {
      return rejectWithValue('You do not have permission to edit timeline events.');
    }
    if (!event.title.trim()) {
      return rejectWithValue('Event title is required.');
    }
    const timeError = validateEventTime(trip, event);
    if (timeError) {
      return rejectWithValue(timeError);
    }

    const eventRef = doc(db, 'apps', 'waypoint', 'trips', trip.id, 'events', eventId);
    const newSnapshot = isTripActive(trip) ? buildChangeSnapshot(trip, previousEvent, event, uid) : null;
    const trimmedTitle = event.title.trim();
    const reminderId = await resolveEventReminderId(trip, uid, previousEvent, {
      id: eventId,
      title: trimmedTitle,
      dayIndex: event.dayIndex,
      endDayIndex: event.endDayIndex,
      startAt: event.startAt,
      endAt: event.endAt,
      startTime: event.startTime,
      endTime: event.endTime,
      timezone: event.timezone,
      reminderMinutesBefore: event.reminderMinutesBefore,
      reminderEnabled: event.reminderEnabled,
      assignedMemberIds: event.assignedMemberIds,
    });
    const trimmedFields = {
      id: eventId,
      tripId: trip.id,
      title: trimmedTitle,
      locationName: event.locationName?.trim() || null,
      address: event.address?.trim() || null,
      linkUrl: event.linkUrl?.trim() || null,
      linkPreview: event.linkUrl?.trim() ? event.linkPreview : null,
      linkKind: event.linkUrl?.trim() ? event.linkKind : null,
      groupLabel: event.groupLabel?.trim() || null,
      stackLabel: event.stackLabel?.trim() || null,
      reminderId,
      lastEditedAt: Date.now(),
    };
    // `seenBy`, the archive fields, and `changeHistory` change independently of this form,
    // so the cached copies are never written back — history is appended server-side instead.
    const editableFields = Object.fromEntries(
      Object.entries(event).filter(
        ([key]) => !CONCURRENTLY_WRITTEN_EVENT_FIELDS.includes(key),
      ),
    );

    await updateDoc(eventRef, {
      ...getMissingEventFields(previousEvent),
      ...editableFields,
      ...trimmedFields,
      ...(newSnapshot ? { changeHistory: arrayUnion(newSnapshot) } : {}),
    });

    const updatedEvent: TimelineEvent = {
      ...event,
      ...trimmedFields,
      changeHistory: [...(previousEvent.changeHistory ?? []), ...(newSnapshot ? [newSnapshot] : [])],
    };
    return updatedEvent;
  },
);

// The rule validates the whole merged document, so an event saved before these
// fields existed needs them written alongside any partial update.
function getMissingEventFields(event: TimelineEvent): Partial<TimelineEvent> {
  const defaults: Partial<TimelineEvent> = {
    endDayIndex: event.dayIndex ?? null,
    startAt: null,
    endAt: null,
    startTime: null,
    endTime: null,
    timezone: null,
    endTimezone: null,
    eventDetails: null,
    attendeeTargetType: 'EVERYONE_INCLUDING_FUTURE',
    assignedMemberIds: [],
    venueOpenTime: null,
    venueCloseTime: null,
    arriveByTime: null,
    arriveByNote: null,
    changeHistory: [],
    place: null,
    linkUrl: null,
    linkPreview: null,
    linkKind: null,
    groupLabel: null,
    stackLabel: null,
    reminderMinutesBefore: DEFAULT_REMINDER_MINUTES_BEFORE,
    reminderEnabled: true,
    reminderId: null,
    isArchived: false,
    archivedBy: null,
    archivedAt: null,
    seenBy: {},
  };
  const missing = Object.fromEntries(
    Object.entries(defaults).filter(([key]) => !(key in event)),
  ) as Partial<TimelineEvent>;
  return missing;
}

interface UpdateEventNotesInput {
  uid: string;
  trip: TripSpace;
  event: TimelineEvent;
  notes: string;
}

export const updateEventNotes = createAsyncThunk<
  TimelineEvent,
  UpdateEventNotesInput,
  { rejectValue: string }
>('waypoint/events/updateNotes', async ({ uid, trip, event, notes }, { rejectWithValue }) => {
  if (!canEditExistingItem(trip, uid)) {
    return rejectWithValue('You do not have permission to edit this event.');
  }

  const changes = {
    ...getMissingEventFields(event),
    notes: notes.trim() || null,
    lastEditedAt: Date.now(),
  };
  await updateDoc(doc(db, 'apps', 'waypoint', 'trips', trip.id, 'events', event.id), changes);
  return { ...event, ...changes };
});

interface SetEventsStackInput {
  uid: string;
  trip: TripSpace;
  events: TimelineEvent[];
  /** The stack's name, or `null` to take the events out of any stack. */
  stackName: string | null;
}

// Each event's stack label is its own field, so these are independent writes.
export const setEventsStack = createAsyncThunk<
  void,
  SetEventsStackInput,
  { rejectValue: string }
>('waypoint/events/setStack', async ({ uid, trip, events, stackName }, { rejectWithValue }) => {
  if (!canEditExistingItem(trip, uid)) {
    return rejectWithValue('You do not have permission to edit timeline events.');
  }

  const name = stackName?.trim() || null;
  const batch = writeBatch(db);
  events.forEach((event) => {
    batch.update(doc(db, 'apps', 'waypoint', 'trips', trip.id, 'events', event.id), {
      ...getMissingEventFields(event),
      stackLabel: name,
      lastEditedAt: Date.now(),
    });
  });
  await batch.commit();
});

interface SetEventsGroupInput {
  uid: string;
  trip: TripSpace;
  events: TimelineEvent[];
  /** The group's name, or `null` to take the events out of any group. */
  groupName: string | null;
}

export const setEventsGroup = createAsyncThunk<
  void,
  SetEventsGroupInput,
  { rejectValue: string }
>('waypoint/events/setGroup', async ({ uid, trip, events, groupName }, { rejectWithValue }) => {
  if (!canEditExistingItem(trip, uid)) {
    return rejectWithValue('You do not have permission to edit timeline events.');
  }

  const name = groupName?.trim() || null;
  const batch = writeBatch(db);
  events.forEach((event) => {
    batch.update(doc(db, 'apps', 'waypoint', 'trips', trip.id, 'events', event.id), {
      ...getMissingEventFields(event),
      groupLabel: name,
      lastEditedAt: Date.now(),
    });
  });
  await batch.commit();
});

interface SetEventArchivedInput {
  uid: string;
  trip: TripSpace;
  event: TimelineEvent;
  isArchived: boolean;
}

export const setEventArchived = createAsyncThunk<
  { eventId: string; isArchived: boolean },
  SetEventArchivedInput,
  { rejectValue: string }
>(
  'waypoint/events/setArchived',
  async ({ uid, trip, event, isArchived }, { rejectWithValue }) => {
    if (!canArchiveEvent(trip, uid)) {
      return rejectWithValue('You do not have permission to archive this event.');
    }

    await updateDoc(doc(db, 'apps', 'waypoint', 'trips', trip.id, 'events', event.id), {
      ...getMissingEventFields(event),
      isArchived,
      archivedBy: isArchived ? uid : null,
      archivedAt: isArchived ? Date.now() : null,
      lastEditedAt: Date.now(),
    });
    return { eventId: event.id, isArchived };
  },
);

interface MarkEventSeenInput {
  uid: string;
  trip: TripSpace;
  eventId: string;
}

// Written by every trip member independently (each to their own key), so — unlike a plain
// updateDoc — this must read-modify-write inside a transaction to avoid one member's mark
// clobbering another's concurrent one.
export const markEventSeen = createAsyncThunk<void, MarkEventSeenInput, { rejectValue: string }>(
  'waypoint/events/markSeen',
  async ({ uid, trip, eventId }) => {
    const eventRef = doc(db, 'apps', 'waypoint', 'trips', trip.id, 'events', eventId);
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(eventRef);
      if (!snapshot.exists()) {
        return;
      }
      const seenBy = (snapshot.data().seenBy ?? {}) as Record<string, number>;
      transaction.update(eventRef, { seenBy: { ...seenBy, [uid]: Date.now() } });
    });
  },
);

export const deleteEvent = createAsyncThunk<
  string,
  DeleteEventInput,
  { rejectValue: string }
>(
  'waypoint/events/delete',
  async ({ uid, trip, eventId }, { getState, rejectWithValue }) => {
    if (!canEditExistingItem(trip, uid)) {
      return rejectWithValue('You do not have permission to delete timeline events.');
    }

    const current = (getState() as RootState).waypoint.events.items.find(
      (event) => event.id === eventId,
    );

    const eventRef = doc(db, 'apps', 'waypoint', 'trips', trip.id, 'events', eventId);
    await deleteDoc(eventRef);
    await cancelEventReminder(current?.reminderId ?? null);
    return eventId;
  },
);

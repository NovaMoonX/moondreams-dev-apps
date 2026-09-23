import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, deleteDoc, doc, setDoc } from 'firebase/firestore';

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
import { cancelEventReminder, scheduleEventReminder } from '@apps/waypoint/utils/reminders';
import { canEditExistingItem, isTripActive } from '@apps/waypoint/utils/roleGuards';

interface CreateEventInput {
  uid: string;
  trip: TripSpace;
  event: EventFields & { eventDetails: EventDetails | null; eventType: EventType };
}

type EventFields = Omit<
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

function canEditEvents(uid: string, trip: TripSpace) {
  return ['ADMIN', 'EDITOR'].includes(trip.members[uid]?.role ?? '');
}

const TRACKED_CHANGE_FIELDS = [
  'startAt',
  'endAt',
  'locationName',
  'dayIndex',
  'endDayIndex',
] as const;

function buildChangeSnapshot(
  previousEvent: TimelineEvent,
  nextEvent: TimelineEvent,
  uid: string,
): EventChangeSnapshot | null {
  const now = Date.now();
  const changes: EventFieldChange[] = TRACKED_CHANGE_FIELDS.filter(
    (field) => previousEvent[field] !== nextEvent[field],
  ).map((field) => ({
    field,
    previousValue: previousEvent[field] as number | string,
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
  nextEvent: Pick<
    TimelineEvent,
    'id' | 'title' | 'startAt' | 'reminderMinutesBefore' | 'reminderEnabled' | 'assignedMemberIds'
  >,
): Promise<string | null> {
  const startChanged = previousEvent.startAt !== nextEvent.startAt;
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
  if (!canEditEvents(uid, trip)) {
    return rejectWithValue('You do not have permission to add timeline events.');
  }
  if (!event.title.trim()) {
    return rejectWithValue('Event title is required.');
  }
  if (!Number.isFinite(event.startAt)) {
    return rejectWithValue('Choose a valid event date and time.');
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
      startAt: event.startAt,
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
    notes: null,
    changeHistory: [],
    reminderId,
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
    if (!Number.isFinite(event.startAt)) {
      return rejectWithValue('Choose a valid event date and time.');
    }

    const eventRef = doc(db, 'apps', 'waypoint', 'trips', trip.id, 'events', eventId);
    const newSnapshot = isTripActive(trip) ? buildChangeSnapshot(previousEvent, event, uid) : null;
    const trimmedTitle = event.title.trim();
    const reminderId = await resolveEventReminderId(trip, uid, previousEvent, {
      id: eventId,
      title: trimmedTitle,
      startAt: event.startAt,
      reminderMinutesBefore: event.reminderMinutesBefore,
      reminderEnabled: event.reminderEnabled,
      assignedMemberIds: event.assignedMemberIds,
    });
    const updatedEvent: TimelineEvent = {
      ...event,
      id: eventId,
      tripId: trip.id,
      title: trimmedTitle,
      locationName: event.locationName?.trim() || null,
      address: event.address?.trim() || null,
      linkUrl: event.linkUrl?.trim() || null,
      linkPreview: event.linkUrl?.trim() ? event.linkPreview : null,
      changeHistory: newSnapshot
        ? [...(previousEvent.changeHistory ?? []), newSnapshot]
        : (previousEvent.changeHistory ?? []),
      reminderId,
      lastEditedAt: Date.now(),
    };

    await setDoc(eventRef, updatedEvent);
    return updatedEvent;
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

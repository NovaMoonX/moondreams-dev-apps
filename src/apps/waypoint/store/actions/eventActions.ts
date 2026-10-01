import { createAsyncThunk } from '@reduxjs/toolkit';
import { arrayUnion, collection, deleteDoc, doc, runTransaction, setDoc, updateDoc } from 'firebase/firestore';

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
import { DEFAULT_REMINDER_MINUTES_BEFORE } from '@apps/waypoint/constants';
import { cancelEventReminder, scheduleEventReminder } from '@apps/waypoint/utils/reminders';
import { canArchiveEvent, canCreateItem, canEditExistingItem, isTripActive } from '@apps/waypoint/utils/roleGuards';

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

const CONCURRENTLY_WRITTEN_EVENT_FIELDS = [
  'seenBy',
  'isArchived',
  'archivedBy',
  'archivedAt',
  'changeHistory',
];

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
  if (!canCreateItem(trip, uid)) {
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
    const trimmedFields = {
      id: eventId,
      tripId: trip.id,
      title: trimmedTitle,
      locationName: event.locationName?.trim() || null,
      address: event.address?.trim() || null,
      linkUrl: event.linkUrl?.trim() || null,
      linkPreview: event.linkUrl?.trim() ? event.linkPreview : null,
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
    endDayIndex: event.dayIndex,
    eventDetails: null,
    attendeeTargetType: 'EVERYONE_INCLUDING_FUTURE',
    assignedMemberIds: [],
    venueOpenTime: null,
    venueCloseTime: null,
    changeHistory: [],
    place: null,
    linkUrl: null,
    linkPreview: null,
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

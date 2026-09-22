import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type {
  EventChangeSnapshot,
  EventDetails,
  EventFieldChange,
  EventType,
  TimelineEvent,
  TripSpace,
} from '@apps/waypoint/types';
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
  const createdEvent: TimelineEvent = {
    ...event,
    id: eventRef.id,
    tripId: trip.id,
    title: event.title.trim(),
    locationName: event.locationName?.trim() || null,
    address: event.address?.trim() || null,
    linkUrl: event.linkUrl?.trim() || null,
    linkPreview: event.linkUrl?.trim() ? event.linkPreview : null,
    notes: null,
    changeHistory: [],
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
    const updatedEvent: TimelineEvent = {
      ...event,
      id: eventId,
      tripId: trip.id,
      title: event.title.trim(),
      locationName: event.locationName?.trim() || null,
      address: event.address?.trim() || null,
      linkUrl: event.linkUrl?.trim() || null,
      linkPreview: event.linkUrl?.trim() ? event.linkPreview : null,
      changeHistory: newSnapshot
        ? [...(previousEvent.changeHistory ?? []), newSnapshot]
        : (previousEvent.changeHistory ?? []),
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
>('waypoint/events/delete', async ({ uid, trip, eventId }, { rejectWithValue }) => {
  if (!canEditExistingItem(trip, uid)) {
    return rejectWithValue('You do not have permission to delete timeline events.');
  }

  const eventRef = doc(db, 'apps', 'waypoint', 'trips', trip.id, 'events', eventId);
  await deleteDoc(eventRef);
  return eventId;
});

/** Patches just the scraped photo after a broken-image self-heal refresh. Not a
 * thunk: the live Firestore listener already keeps Redux in sync, and this is a
 * low-stakes background write that shouldn't need loading/error UI state. */
export async function patchEventPlacePhoto(
  tripId: string,
  eventId: string,
  photoUrl: string | null,
  photoRefreshedAt: number,
) {
  const eventRef = doc(db, 'apps', 'waypoint', 'trips', tripId, 'events', eventId);
  await updateDoc(eventRef, {
    'place.photoUrl': photoUrl,
    'place.photoRefreshedAt': photoRefreshedAt,
  });
}

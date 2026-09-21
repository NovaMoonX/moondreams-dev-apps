import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { EventDetails, EventType, TimelineEvent, TripSpace } from '@apps/waypoint/types';

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
}

interface DeleteEventInput {
  uid: string;
  trip: TripSpace;
  eventId: string;
}

function canEditEvents(uid: string, trip: TripSpace) {
  return ['ADMIN', 'EDITOR'].includes(trip.members[uid]?.role ?? '');
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
    notes: null,
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
>('waypoint/events/update', async ({ uid, trip, eventId, event }, { rejectWithValue }) => {
  if (!canEditEvents(uid, trip)) {
    return rejectWithValue('You do not have permission to edit timeline events.');
  }
  if (!event.title.trim()) {
    return rejectWithValue('Event title is required.');
  }
  if (!Number.isFinite(event.startAt)) {
    return rejectWithValue('Choose a valid event date and time.');
  }

  const eventRef = doc(db, 'apps', 'waypoint', 'trips', trip.id, 'events', eventId);
  const updatedEvent: TimelineEvent = {
    ...event,
    id: eventId,
    tripId: trip.id,
    title: event.title.trim(),
    locationName: event.locationName?.trim() || null,
    address: event.address?.trim() || null,
    lastEditedAt: Date.now(),
  };

  await updateDoc(eventRef, updatedEvent);
  return updatedEvent;
});

export const deleteEvent = createAsyncThunk<
  string,
  DeleteEventInput,
  { rejectValue: string }
>('waypoint/events/delete', async ({ uid, trip, eventId }, { rejectWithValue }) => {
  if (!canEditEvents(uid, trip)) {
    return rejectWithValue('You do not have permission to delete timeline events.');
  }

  const eventRef = doc(db, 'apps', 'waypoint', 'trips', trip.id, 'events', eventId);
  await deleteDoc(eventRef);
  return eventId;
});

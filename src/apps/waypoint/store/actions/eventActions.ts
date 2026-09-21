import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, doc, setDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { EventDetails, EventType, TimelineEvent, TripSpace } from '@apps/waypoint/types';

interface CreateEventInput {
  uid: string;
  trip: TripSpace;
  event: Omit<
    TimelineEvent,
    'id' | 'tripId' | 'createdBy' | 'createdAt' | 'lastEditedAt'
  > & { eventDetails: EventDetails | null; eventType: EventType };
}

export const createEvent = createAsyncThunk<
  TimelineEvent,
  CreateEventInput,
  { rejectValue: string }
>('waypoint/events/create', async ({ uid, trip, event }, { rejectWithValue }) => {
  if (!['ADMIN', 'EDITOR'].includes(trip.members[uid]?.role ?? '')) {
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

import { createAsyncThunk } from '@reduxjs/toolkit';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { getDayIndex } from '@/utils/dateRangeUtils';
import type { EventSuggestion, TimelineEvent, TripSpace } from '@apps/waypoint/types';
import { cancelEventReminder, scheduleEventReminder } from '@apps/waypoint/utils/reminders';
import { isTripAdmin, isTripMember } from '@apps/waypoint/utils/roleGuards';

interface CreateEventSuggestionInput {
  uid: string;
  trip: TripSpace;
  eventId: string;
  suggestedTitle: string;
  suggestedStartAt: number;
  suggestedEndAt: number | null;
  suggestedLocationName: string | null;
  suggestedAddress: string | null;
  suggestedLatitude: number | null;
  suggestedLongitude: number | null;
  suggestedPlace: EventSuggestion['suggestedPlace'];
  note: string | null;
}

export const createEventSuggestion = createAsyncThunk<
  EventSuggestion,
  CreateEventSuggestionInput,
  { rejectValue: string }
>(
  'waypoint/eventSuggestions/create',
  async ({ uid, trip, ...fields }, { rejectWithValue }) => {
    if (!isTripMember(trip, uid)) {
      return rejectWithValue('You do not have permission to suggest changes to this trip.');
    }
    if (!fields.suggestedTitle.trim()) {
      return rejectWithValue('Enter a title for the suggested change.');
    }

    const suggestionRef = doc(
      collection(db, 'apps', 'waypoint', 'trips', trip.id, 'eventSuggestions'),
    );
    const suggestion: EventSuggestion = {
      id: suggestionRef.id,
      tripId: trip.id,
      eventId: fields.eventId,
      suggestedTitle: fields.suggestedTitle.trim(),
      suggestedStartAt: fields.suggestedStartAt,
      suggestedEndAt: fields.suggestedEndAt,
      suggestedLocationName: fields.suggestedLocationName?.trim() || null,
      suggestedAddress: fields.suggestedAddress?.trim() || null,
      suggestedLatitude: fields.suggestedLatitude,
      suggestedLongitude: fields.suggestedLongitude,
      suggestedPlace: fields.suggestedPlace,
      note: fields.note?.trim() || null,
      upvotedBy: [uid],
      createdBy: uid,
      createdAt: Date.now(),
    };

    await setDoc(suggestionRef, suggestion);
    return suggestion;
  },
);

interface UpdateEventSuggestionInput {
  uid: string;
  trip: TripSpace;
  suggestion: EventSuggestion;
  suggestedTitle: string;
  suggestedStartAt: number;
  suggestedEndAt: number | null;
  suggestedLocationName: string | null;
  suggestedAddress: string | null;
  suggestedLatitude: number | null;
  suggestedLongitude: number | null;
  suggestedPlace: EventSuggestion['suggestedPlace'];
  note: string | null;
}

export const updateEventSuggestion = createAsyncThunk<
  EventSuggestion,
  UpdateEventSuggestionInput,
  { rejectValue: string }
>(
  'waypoint/eventSuggestions/update',
  async ({ uid, trip, suggestion, ...fields }, { rejectWithValue }) => {
    if (suggestion.createdBy !== uid) {
      return rejectWithValue('You can only edit your own suggestion.');
    }
    if (!fields.suggestedTitle.trim()) {
      return rejectWithValue('Enter a title for the suggested change.');
    }

    const updatedSuggestion: EventSuggestion = {
      ...suggestion,
      suggestedTitle: fields.suggestedTitle.trim(),
      suggestedStartAt: fields.suggestedStartAt,
      suggestedEndAt: fields.suggestedEndAt,
      suggestedLocationName: fields.suggestedLocationName?.trim() || null,
      suggestedAddress: fields.suggestedAddress?.trim() || null,
      suggestedLatitude: fields.suggestedLatitude,
      suggestedLongitude: fields.suggestedLongitude,
      suggestedPlace: fields.suggestedPlace,
      note: fields.note?.trim() || null,
    };

    await setDoc(
      doc(db, 'apps', 'waypoint', 'trips', trip.id, 'eventSuggestions', suggestion.id),
      updatedSuggestion,
    );
    return updatedSuggestion;
  },
);

interface ToggleSuggestionUpvoteInput {
  uid: string;
  trip: TripSpace;
  suggestionId: string;
  isUpvoted: boolean;
}

export const toggleSuggestionUpvote = createAsyncThunk<
  void,
  ToggleSuggestionUpvoteInput,
  { rejectValue: string }
>(
  'waypoint/eventSuggestions/toggleUpvote',
  async ({ uid, trip, suggestionId, isUpvoted }, { rejectWithValue }) => {
    if (!isTripMember(trip, uid)) {
      return rejectWithValue('You do not have permission to vote on this suggestion.');
    }

    const suggestionRef = doc(
      db,
      'apps',
      'waypoint',
      'trips',
      trip.id,
      'eventSuggestions',
      suggestionId,
    );
    await updateDoc(suggestionRef, {
      upvotedBy: isUpvoted ? arrayRemove(uid) : arrayUnion(uid),
    });
  },
);

interface ApproveEventSuggestionInput {
  uid: string;
  trip: TripSpace;
  sourceEvent: TimelineEvent;
  suggestion: EventSuggestion;
}

export const approveEventSuggestion = createAsyncThunk<
  void,
  ApproveEventSuggestionInput,
  { rejectValue: string }
>(
  'waypoint/eventSuggestions/approve',
  async ({ uid, trip, sourceEvent, suggestion }, { rejectWithValue }) => {
    if (!isTripAdmin(trip, uid)) {
      return rejectWithValue('Only trip admins can approve suggested changes.');
    }

    const newEventRef = doc(collection(db, 'apps', 'waypoint', 'trips', trip.id, 'events'));
    const dayIndex = getDayIndex(trip.startDate, suggestion.suggestedStartAt);
    const endDayIndex =
      suggestion.suggestedEndAt !== null
        ? getDayIndex(trip.startDate, suggestion.suggestedEndAt)
        : dayIndex;
    const now = Date.now();

    await cancelEventReminder(sourceEvent.reminderId);
    const reminderId = await scheduleEventReminder({
      trip,
      uid,
      event: {
        id: newEventRef.id,
        title: suggestion.suggestedTitle,
        startAt: suggestion.suggestedStartAt,
        reminderMinutesBefore: sourceEvent.reminderMinutesBefore,
        reminderEnabled: sourceEvent.reminderEnabled,
        assignedMemberIds: sourceEvent.assignedMemberIds,
      },
    });

    const newEvent: TimelineEvent = {
      ...sourceEvent,
      id: newEventRef.id,
      dayIndex,
      endDayIndex,
      title: suggestion.suggestedTitle,
      startAt: suggestion.suggestedStartAt,
      endAt: suggestion.suggestedEndAt,
      locationName: suggestion.suggestedLocationName,
      address: suggestion.suggestedAddress,
      latitude: suggestion.suggestedLatitude,
      longitude: suggestion.suggestedLongitude,
      place: suggestion.suggestedPlace,
      reminderId,
      isArchived: false,
      seenBy: {},
      createdBy: uid,
      createdAt: now,
      lastEditedAt: now,
    };

    const batch = writeBatch(db);
    batch.set(newEventRef, newEvent);
    batch.update(doc(db, 'apps', 'waypoint', 'trips', trip.id, 'events', sourceEvent.id), {
      isArchived: true,
      lastEditedAt: now,
    });
    batch.delete(
      doc(db, 'apps', 'waypoint', 'trips', trip.id, 'eventSuggestions', suggestion.id),
    );
    await batch.commit();
  },
);

interface DeclineEventSuggestionInput {
  uid: string;
  trip: TripSpace;
  suggestionId: string;
}

export const declineEventSuggestion = createAsyncThunk<
  void,
  DeclineEventSuggestionInput,
  { rejectValue: string }
>(
  'waypoint/eventSuggestions/decline',
  async ({ uid, trip, suggestionId }, { rejectWithValue }) => {
    if (!isTripAdmin(trip, uid)) {
      return rejectWithValue('Only trip admins can decline suggested changes.');
    }

    await deleteDoc(doc(db, 'apps', 'waypoint', 'trips', trip.id, 'eventSuggestions', suggestionId));
  },
);

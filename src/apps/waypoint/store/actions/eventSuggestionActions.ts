import { createAsyncThunk } from '@reduxjs/toolkit';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  runTransaction,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { getDayIndex } from '@/utils/dateRangeUtils';
import { getErrorMessage } from '@/utils/errorUtils';
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
    if (fields.suggestedEndAt !== null && fields.suggestedEndAt <= fields.suggestedStartAt) {
      return rejectWithValue('The suggested end time must be after the start time.');
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

    if (fields.suggestedEndAt !== null && fields.suggestedEndAt <= fields.suggestedStartAt) {
      return rejectWithValue('The suggested end time must be after the start time.');
    }

    const changes = {
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

    const suggestionRef = doc(
      db,
      'apps',
      'waypoint',
      'trips',
      trip.id,
      'eventSuggestions',
      suggestion.id,
    );
    try {
      // Reads the live document first: an Admin may have approved or declined this
      // suggestion while the edit modal was open, and the edit must not resurrect it.
      const currentSuggestion = await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(suggestionRef);
        if (!snapshot.exists()) {
          throw new Error('This suggestion was already approved or removed.');
        }

        transaction.update(suggestionRef, changes);
        return snapshot.data() as EventSuggestion;
      });
      return { ...currentSuggestion, ...changes };
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, 'Unable to save this suggestion.'));
    }
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
    const sourceEventRef = doc(db, 'apps', 'waypoint', 'trips', trip.id, 'events', sourceEvent.id);
    const suggestionRef = doc(
      db,
      'apps',
      'waypoint',
      'trips',
      trip.id,
      'eventSuggestions',
      suggestion.id,
    );
    const dayIndex = getDayIndex(trip.startDate, suggestion.suggestedStartAt);
    const endDayIndex =
      suggestion.suggestedEndAt !== null
        ? getDayIndex(trip.startDate, suggestion.suggestedEndAt)
        : dayIndex;
    const now = Date.now();

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

    try {
      // Everything is re-read inside the transaction: another Admin may have approved or
      // declined this suggestion, archived the event, or the owner may have edited the
      // suggestion since this card was rendered.
      await runTransaction(db, async (transaction) => {
        const [sourceSnapshot, suggestionSnapshot] = await Promise.all([
          transaction.get(sourceEventRef),
          transaction.get(suggestionRef),
        ]);
        if (!suggestionSnapshot.exists()) {
          throw new Error('This suggestion was already approved or declined.');
        }
        if (!sourceSnapshot.exists() || sourceSnapshot.data().isArchived === true) {
          throw new Error('This event was already replaced or archived.');
        }
        const currentSuggestion = suggestionSnapshot.data() as EventSuggestion;
        if (
          currentSuggestion.suggestedTitle !== suggestion.suggestedTitle ||
          currentSuggestion.suggestedStartAt !== suggestion.suggestedStartAt ||
          currentSuggestion.suggestedEndAt !== suggestion.suggestedEndAt
        ) {
          throw new Error('This suggestion was just edited. Take another look before approving.');
        }

        const newEvent: TimelineEvent = {
          ...(sourceSnapshot.data() as TimelineEvent),
          id: newEventRef.id,
          dayIndex,
          endDayIndex,
          title: suggestion.suggestedTitle,
          startAt: suggestion.suggestedStartAt,
          endAt: suggestion.suggestedEndAt,
          locationName: currentSuggestion.suggestedLocationName,
          address: currentSuggestion.suggestedAddress,
          latitude: currentSuggestion.suggestedLatitude,
          longitude: currentSuggestion.suggestedLongitude,
          place: currentSuggestion.suggestedPlace,
          reminderId,
          isArchived: false,
          archivedBy: null,
          archivedAt: null,
          seenBy: {},
          createdBy: uid,
          createdAt: now,
          lastEditedAt: now,
        };

        transaction.set(newEventRef, newEvent);
        transaction.update(sourceEventRef, {
          isArchived: true,
          archivedBy: uid,
          archivedAt: now,
          lastEditedAt: now,
        });
        transaction.delete(suggestionRef);
      });
    } catch (error) {
      await cancelEventReminder(reminderId);
      return rejectWithValue(getErrorMessage(error, 'Unable to approve this suggestion.'));
    }

    await cancelEventReminder(sourceEvent.reminderId);
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

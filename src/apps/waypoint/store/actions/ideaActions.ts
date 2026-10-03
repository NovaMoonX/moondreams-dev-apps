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
import { isValidHttpUrl } from '@/utils/urlUtils';
import { validateEventTime, type EventFields } from '@apps/waypoint/store/actions/eventActions';
import type { IdeaDetails, IdeaType, TimelineEvent, TripIdea, TripSpace } from '@apps/waypoint/types';
import { cancelEventReminder, scheduleEventReminder } from '@apps/waypoint/utils/reminders';
import {
  canAddIdea,
  canCreateItem,
  canDeleteIdea,
  canEditIdea,
  isTripMember,
} from '@apps/waypoint/utils/roleGuards';

interface CreateIdeaInput {
  uid: string;
  trip: TripSpace;
  ideaType: IdeaType;
  title: string;
  linkUrl: string | null;
  notes: string | null;
  ideaDetails: IdeaDetails | null;
}

export const createIdea = createAsyncThunk<TripIdea, CreateIdeaInput, { rejectValue: string }>(
  'waypoint/ideas/create',
  async ({ uid, trip, ...fields }, { rejectWithValue }) => {
    if (!isTripMember(trip, uid)) {
      return rejectWithValue('You do not have permission to add ideas to this trip.');
    }
    if (!canAddIdea(trip, uid)) {
      return rejectWithValue('This trip has started, so new ideas can no longer be added.');
    }
    if (!fields.title.trim()) {
      return rejectWithValue('Enter a name for this idea.');
    }

    if (fields.linkUrl?.trim() && !isValidHttpUrl(fields.linkUrl)) {
      return rejectWithValue('Enter a valid link, like https://example.com.');
    }

    const ideaRef = doc(collection(db, 'apps', 'waypoint', 'trips', trip.id, 'ideas'));
    const now = Date.now();
    const idea: TripIdea = {
      id: ideaRef.id,
      tripId: trip.id,
      ideaType: fields.ideaType,
      title: fields.title.trim(),
      notes: fields.notes?.trim() || null,
      linkUrl: fields.linkUrl?.trim() || null,
      ideaDetails: fields.ideaDetails ?? null,
      addedByUid: uid,
      voterUids: [uid],
      convertedToEntityId: null,
      createdAt: now,
      lastEditedAt: now,
    };

    await setDoc(ideaRef, idea);
    return idea;
  },
);

interface ToggleIdeaVoteInput {
  uid: string;
  trip: TripSpace;
  ideaId: string;
  hasVoted: boolean;
}

export const toggleIdeaVote = createAsyncThunk<void, ToggleIdeaVoteInput, { rejectValue: string }>(
  'waypoint/ideas/toggleVote',
  async ({ uid, trip, ideaId, hasVoted }, { rejectWithValue }) => {
    if (!isTripMember(trip, uid)) {
      return rejectWithValue('You do not have permission to vote on this idea.');
    }

    const ideaRef = doc(db, 'apps', 'waypoint', 'trips', trip.id, 'ideas', ideaId);
    await updateDoc(ideaRef, {
      voterUids: hasVoted ? arrayRemove(uid) : arrayUnion(uid),
    });
  },
);

interface UpdateIdeaInput extends CreateIdeaInput {
  idea: TripIdea;
}

export const updateIdea = createAsyncThunk<void, UpdateIdeaInput, { rejectValue: string }>(
  'waypoint/ideas/update',
  async ({ uid, trip, idea, ...fields }, { rejectWithValue }) => {
    if (!canEditIdea(trip, uid, idea)) {
      return rejectWithValue('Only the person who added this idea can change it.');
    }
    if (!fields.title.trim()) {
      return rejectWithValue('Enter a name for this idea.');
    }
    if (fields.linkUrl?.trim() && !isValidHttpUrl(fields.linkUrl)) {
      return rejectWithValue('Enter a valid link, like https://example.com.');
    }

    await updateDoc(doc(db, 'apps', 'waypoint', 'trips', trip.id, 'ideas', idea.id), {
      ideaType: fields.ideaType,
      title: fields.title.trim(),
      notes: fields.notes?.trim() || null,
      linkUrl: fields.linkUrl?.trim() || null,
      ideaDetails: fields.ideaDetails ?? null,
      lastEditedAt: Date.now(),
    });
  },
);

interface DeleteIdeaInput {
  uid: string;
  trip: TripSpace;
  idea: TripIdea;
}

export const deleteIdea = createAsyncThunk<void, DeleteIdeaInput, { rejectValue: string }>(
  'waypoint/ideas/delete',
  async ({ uid, trip, idea }, { rejectWithValue }) => {
    if (!canDeleteIdea(trip, uid, idea)) {
      return rejectWithValue('Only the person who added this idea, or an Admin, can delete it.');
    }
    await deleteDoc(doc(db, 'apps', 'waypoint', 'trips', trip.id, 'ideas', idea.id));
  },
);

interface ConvertIdeaToEventInput {
  uid: string;
  trip: TripSpace;
  idea: TripIdea;
  event: EventFields;
}

export const convertIdeaToEvent = createAsyncThunk<
  TimelineEvent,
  ConvertIdeaToEventInput,
  { rejectValue: string }
>('waypoint/ideas/convertToEvent', async ({ uid, trip, idea, event }, { rejectWithValue }) => {
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

  const ideaRef = doc(db, 'apps', 'waypoint', 'trips', trip.id, 'ideas', idea.id);
  const eventRef = doc(collection(db, 'apps', 'waypoint', 'trips', trip.id, 'events'));
  const now = Date.now();
  const trimmedTitle = event.title.trim();
  const reminderId = await scheduleEventReminder({
    trip,
    uid,
    event: { ...event, id: eventRef.id, title: trimmedTitle },
  });
  const linkUrl = event.linkUrl?.trim() || null;
  const createdEvent: TimelineEvent = {
    ...event,
    id: eventRef.id,
    tripId: trip.id,
    title: trimmedTitle,
    locationName: event.locationName?.trim() || null,
    address: event.address?.trim() || null,
    linkUrl,
    linkPreview: linkUrl ? event.linkPreview : null,
    linkKind: linkUrl ? event.linkKind : null,
    groupLabel: event.groupLabel?.trim() || null,
    stackLabel: event.stackLabel?.trim() || null,
    notes: event.notes?.trim() || null,
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

  try {
    await runTransaction(db, async (transaction) => {
      const ideaSnapshot = await transaction.get(ideaRef);
      if (!ideaSnapshot.exists()) {
        throw new Error('This idea was removed, so it can no longer be added to the itinerary.');
      }
      if ((ideaSnapshot.data().convertedToEntityId ?? null) !== null) {
        throw new Error('Someone already added this idea to the itinerary.');
      }

      transaction.set(eventRef, createdEvent);
      transaction.update(ideaRef, { convertedToEntityId: eventRef.id });
    });
  } catch (conversionError) {
    if (reminderId) {
      await cancelEventReminder(reminderId);
    }
    return rejectWithValue(
      conversionError instanceof Error ? conversionError.message : 'Unable to add this idea to the itinerary.',
    );
  }

  return createdEvent;
});

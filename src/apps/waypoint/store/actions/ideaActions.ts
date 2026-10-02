import { createAsyncThunk } from '@reduxjs/toolkit';
import { arrayRemove, arrayUnion, collection, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { isValidHttpUrl } from '@/utils/urlUtils';
import type { IdeaDetails, IdeaType, TripIdea, TripSpace } from '@apps/waypoint/types';
import { canAddIdea, canManageIdea, isTripMember } from '@apps/waypoint/utils/roleGuards';

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
    if (!canManageIdea(trip, uid, idea)) {
      return rejectWithValue('Only the person who added this idea, or an Editor or Admin, can change it.');
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
    if (!canManageIdea(trip, uid, idea)) {
      return rejectWithValue('Only the person who added this idea, or an Editor or Admin, can delete it.');
    }
    await deleteDoc(doc(db, 'apps', 'waypoint', 'trips', trip.id, 'ideas', idea.id));
  },
);

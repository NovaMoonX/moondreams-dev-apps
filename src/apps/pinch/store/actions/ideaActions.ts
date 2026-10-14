import { createAsyncThunk } from '@reduxjs/toolkit';
import { FirebaseError } from 'firebase/app';
import { deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { deleteFile, uploadFile } from '@/lib/firebase/storage';
import type { RootState } from '@/store';
import { generateUuid } from '@/utils';
import { getErrorMessage } from '@/utils/errorUtils';
import { resizeImageToWebp } from '@/utils/imageCompression';
import { getComparableUrl, getWebLinkHost } from '@/utils/urlUtils';
import {
  IDEA_PHOTO_MAX_DIMENSION,
  MAX_IDEA_NOTE_LENGTH,
  MAX_IDEA_TITLE_LENGTH,
  SOFT_MAX_IDEAS,
} from '@apps/pinch/constants';
import type { Idea, IdeaKind } from '@apps/pinch/types';
import {
  clipIdeaTitle,
  clipSiteName,
  findIdeaByUrl,
  getMissingIdeaFields,
  toIdeaImageUrl,
  toIdeaUrl,
} from '@apps/pinch/utils/ideas';

const ideaDoc = (uid: string, id: string) =>
  doc(db, 'apps', 'pinch', 'kitchens', uid, 'ideas', id);

export const getIdeaPhotoPath = (uid: string, ideaId: string) =>
  `apps/pinch/kitchens/${uid}/ideas/${ideaId}/photo.webp`;

const BAD_TITLE = `Give it a title of up to ${MAX_IDEA_TITLE_LENGTH} characters.`;
const BAD_NOTE = `Keep the note to ${MAX_IDEA_NOTE_LENGTH} characters.`;
const BAD_LINK = 'Paste a web link that starts with http or https.';
const DUPLICATE_LINK = "That one's already in your ideas.";
const PHOTO_FAILED =
  "We couldn't save that picture. Check your connection and try again.";

/** A Firebase error is logged and replaced by the fallback; our own sentences are shown as written. */
const getWriteMessage = (error: unknown, fallback: string) => {
  if (error instanceof FirebaseError) {
    console.error('Pinch idea write failed', error);
    return fallback;
  }
  return getErrorMessage(error, fallback);
};

const getNote = (note: string | null) => note?.trim() || null;

export interface IdeaDraft {
  kind: IdeaKind;
  title: string;
  note: string | null;
  /** LINK ideas only. */
  url: string | null;
  siteName: string | null;
  imageUrl: string | null;
  /** PHOTO ideas only; resized and uploaded with the idea. */
  photoFile: File | null;
}

interface CreateIdeaInput {
  uid: string;
  draft: IdeaDraft;
}

/** A photo goes to Storage first and is removed again if the write fails. */
export const createIdea = createAsyncThunk<
  string,
  CreateIdeaInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/ideas/create',
  async ({ uid, draft }, { getState, rejectWithValue }) => {
    const note = getNote(draft.note);
    const { items } = getState().pinch.ideas;
    const url = draft.kind === 'LINK' ? toIdeaUrl(draft.url ?? '') : null;
    const host = url === null ? null : getWebLinkHost(url);
    const title = clipIdeaTitle(draft.title) || clipIdeaTitle(host ?? '');

    if (title === '') return rejectWithValue(BAD_TITLE);
    if (note !== null && note.length > MAX_IDEA_NOTE_LENGTH) {
      return rejectWithValue(BAD_NOTE);
    }
    if (items.length >= SOFT_MAX_IDEAS) {
      return rejectWithValue(
        `Your list holds up to ${SOFT_MAX_IDEAS} ideas. Delete one to make room.`,
      );
    }
    if (draft.kind === 'LINK' && url === null) return rejectWithValue(BAD_LINK);
    if (url !== null && findIdeaByUrl(items, url) !== null) {
      return rejectWithValue(DUPLICATE_LINK);
    }
    if (draft.kind === 'PHOTO' && draft.photoFile === null) {
      return rejectWithValue('Pick a picture first.');
    }

    const now = Date.now();
    const id = generateUuid();
    const photoPath = draft.kind === 'PHOTO' ? getIdeaPhotoPath(uid, id) : null;
    const idea: Idea = {
      id,
      kind: draft.kind,
      title,
      note,
      url,
      siteName:
        url === null
          ? null
          : (clipSiteName(draft.siteName) ?? clipSiteName(host)),
      imageUrl: url === null ? null : toIdeaImageUrl(draft.imageUrl),
      photoPath,
      recipeId: null,
      createdAt: now,
      updatedAt: now,
    };

    try {
      if (photoPath && draft.photoFile) {
        await uploadFile(
          photoPath,
          await resizeImageToWebp(draft.photoFile, IDEA_PHOTO_MAX_DIMENSION),
        );
      }
      await setDoc(ideaDoc(uid, id), idea);
    } catch (error) {
      if (photoPath) {
        await deleteFile(photoPath).catch(() => undefined);
      }
      return rejectWithValue(
        getWriteMessage(
          error,
          draft.kind === 'PHOTO' ? PHOTO_FAILED : 'Unable to save this idea.',
        ),
      );
    }

    return id;
  },
);

interface UpdateIdeaInput {
  uid: string;
  id: string;
  title: string;
  note: string | null;
  /** The link of a LINK idea; ignored for the others. */
  url: string | null;
  /** A replacement picture for a PHOTO idea. */
  photoFile: File | null;
}

/** Writes only what the idea's form owns, so a recipe made from it in the meantime keeps its link. */
export const updateIdea = createAsyncThunk<
  string,
  UpdateIdeaInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/ideas/update',
  async (
    { uid, id, title: typedTitle, note: typedNote, url: typedUrl, photoFile },
    { getState, rejectWithValue },
  ) => {
    const { items } = getState().pinch.ideas;
    const existing = items.find((idea) => idea.id === id);
    if (!existing) {
      return rejectWithValue('This idea is gone, so there is nothing to save.');
    }

    const title = clipIdeaTitle(typedTitle);
    const note = getNote(typedNote);
    if (title === '') return rejectWithValue(BAD_TITLE);
    if (note !== null && note.length > MAX_IDEA_NOTE_LENGTH) {
      return rejectWithValue(BAD_NOTE);
    }

    const getLinkChange = (): { fields: Partial<Idea> } | { error: string } => {
      if (existing.kind !== 'LINK') return { fields: {} };
      const url = toIdeaUrl(typedUrl ?? '');
      if (url === null) return { error: BAD_LINK };
      if (url === existing.url) return { fields: {} };
      if (getComparableUrl(url) === getComparableUrl(existing.url ?? '')) {
        return { fields: { url } };
      }
      if (findIdeaByUrl(items, url, id) !== null) {
        return { error: DUPLICATE_LINK };
      }
      return {
        fields: {
          url,
          siteName: clipSiteName(getWebLinkHost(url)),
          imageUrl: null,
        },
      };
    };
    const linkChange = getLinkChange();
    if ('error' in linkChange) return rejectWithValue(linkChange.error);

    const photoPath =
      existing.kind === 'PHOTO' ? getIdeaPhotoPath(uid, id) : null;

    try {
      if (photoPath && photoFile) {
        await uploadFile(
          photoPath,
          await resizeImageToWebp(photoFile, IDEA_PHOTO_MAX_DIMENSION),
        );
      }
      await updateDoc(ideaDoc(uid, id), {
        ...getMissingIdeaFields(existing),
        title,
        note,
        ...linkChange.fields,
        ...(photoPath && photoFile ? { photoPath } : {}),
        updatedAt: Date.now(),
      });
    } catch (error) {
      return rejectWithValue(
        getWriteMessage(
          error,
          photoFile ? PHOTO_FAILED : 'Unable to save this idea.',
        ),
      );
    }

    return id;
  },
);

interface RemoveIdeaInput {
  uid: string;
  id: string;
}

/** A recipe made from the idea is left alone; it reads the idea as gone. */
export const removeIdea = createAsyncThunk<
  string,
  RemoveIdeaInput,
  { state: RootState; rejectValue: string }
>('pinch/ideas/remove', async ({ uid, id }, { getState, rejectWithValue }) => {
  const existing = getState().pinch.ideas.items.find((idea) => idea.id === id);

  try {
    await deleteDoc(ideaDoc(uid, id));
  } catch (error) {
    return rejectWithValue(
      getWriteMessage(error, 'Unable to delete this idea.'),
    );
  }

  if (existing?.photoPath) {
    await deleteFile(existing.photoPath).catch(() => undefined);
  }

  return id;
});

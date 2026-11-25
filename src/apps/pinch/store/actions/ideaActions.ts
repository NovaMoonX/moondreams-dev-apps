import { createAsyncThunk } from '@reduxjs/toolkit';
import { FirebaseError } from 'firebase/app';
import { deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { deleteFile, uploadFile } from '@/lib/firebase/storage';
import type { RootState } from '@/store';
import { generateUuid } from '@/utils';
import { getErrorMessage, getStorageErrorMessage } from '@/utils/errorUtils';
import { compressImageForUse } from '@/utils/imageCompression';
import { getComparableUrl, getWebLinkHost } from '@/utils/urlUtils';
import {
  MAX_IDEA_NOTE_LENGTH,
  MAX_IDEA_TITLE_LENGTH,
  MAX_RECIPE_FILES,
  SOFT_MAX_IDEAS,
} from '@apps/pinch/constants';
import type { IdeasState } from '@apps/pinch/store/slices/ideasSlice';
import type { Idea, IdeaKind } from '@apps/pinch/types';
import {
  clipIdeaTitle,
  clipSiteName,
  findIdeaByUrl,
  getIdeaPhotoPaths,
  getMissingIdeaFields,
  toIdeaImageUrl,
  toIdeaUrl,
} from '@apps/pinch/utils/ideas';

const ideaDoc = (uid: string, id: string) =>
  doc(db, 'apps', 'pinch', 'kitchens', uid, 'ideas', id);

/** The first picture keeps the original name, so an idea from before several pictures is already its own first one. */
/** A replaced set gets a fresh `version`, so a failed replace never overwrites the pictures the document still points at. */
export const getIdeaPhotoPath = (
  uid: string,
  ideaId: string,
  index = 0,
  version: number | null = null,
) =>
  `apps/pinch/kitchens/${uid}/ideas/${ideaId}/photo${version === null ? '' : `-${version}`}${index === 0 ? '' : `-${index}`}.webp`;

const BAD_TITLE = `Give it a title of up to ${MAX_IDEA_TITLE_LENGTH} characters.`;
const BAD_NOTE = `Keep the note to ${MAX_IDEA_NOTE_LENGTH} characters.`;
const BAD_LINK = 'Paste a web link that starts with http or https.';
const DUPLICATE_LINK = "That one's already in your ideas.";
const BAD_PHOTO =
  "That picture couldn't be read. Try a JPG, PNG or WebP photo.";
const PHOTO_FAILED = "We couldn't save that picture.";

const getWriteMessage = (error: unknown, fallback: string) => {
  if (error instanceof FirebaseError) {
    console.error('Pinch idea write failed', error);
    return error.code.startsWith('storage/')
      ? getStorageErrorMessage(error, PHOTO_FAILED)
      : fallback;
  }
  return getErrorMessage(error, fallback);
};

const getNote = (note: string | null) => note?.trim() || null;

const resizeIdeaPhoto = async (file: File) => {
  const resized = await compressImageForUse(file, 'photo');
  if (resized === null) {
    throw new Error(BAD_PHOTO);
  }
  return resized;
};

const resizeIdeaPhotos = (files: File[]) =>
  Promise.all(files.map(resizeIdeaPhoto)).then(
    (photos) => ({ photos }),
    (error: unknown) => ({ error }),
  );

export interface IdeaDraft {
  kind: IdeaKind;
  title: string;
  note: string | null;
  url: string | null;
  siteName: string | null;
  imageUrl: string | null;
  /** A photo idea's pictures, the first being its picture; at most `MAX_RECIPE_FILES`. */
  photoFiles: File[];
}

interface CreateIdeaInput {
  uid: string;
  draft: IdeaDraft;
  /** Chosen by the caller when it tracks the save itself; a new one otherwise. */
  id?: string;
}

/** Why a new idea can't be saved, or null: the checks the save itself makes, so a sheet can answer before it closes. */
export const getNewIdeaProblem = (draft: IdeaDraft, ideas: IdeasState) => {
  const note = getNote(draft.note);
  if (ideas.loadError !== null) {
    return "Your ideas couldn't be loaded, so adding is off for now.";
  }
  if (!ideas.isLoaded) {
    return 'Your ideas are still loading. Give it a moment and try again.';
  }
  const url = draft.kind === 'LINK' ? toIdeaUrl(draft.url ?? '') : null;
  const host = url === null ? null : getWebLinkHost(url);
  const title = clipIdeaTitle(draft.title) || clipIdeaTitle(host ?? '');

  if (title === '') return BAD_TITLE;
  if (note !== null && note.length > MAX_IDEA_NOTE_LENGTH) return BAD_NOTE;
  if (ideas.items.length >= SOFT_MAX_IDEAS) {
    return `Your list holds up to ${SOFT_MAX_IDEAS} ideas. Delete one to make room.`;
  }
  if (draft.kind === 'LINK' && url === null) return BAD_LINK;
  if (url !== null && findIdeaByUrl(ideas.items, url) !== null) {
    return DUPLICATE_LINK;
  }
  if (draft.kind === 'PHOTO' && draft.photoFiles.length === 0) {
    return 'Pick a picture first.';
  }
  if (draft.kind === 'PHOTO' && draft.photoFiles.length > MAX_RECIPE_FILES) {
    return `An idea keeps up to ${MAX_RECIPE_FILES} pictures.`;
  }
  return null;
};

export const createIdea = createAsyncThunk<
  string,
  CreateIdeaInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/ideas/create',
  async ({ uid, draft, id: chosenId }, { getState, rejectWithValue }) => {
    const problem = getNewIdeaProblem(draft, getState().pinch.ideas);
    if (problem !== null) return rejectWithValue(problem);

    const note = getNote(draft.note);
    const url = draft.kind === 'LINK' ? toIdeaUrl(draft.url ?? '') : null;
    const host = url === null ? null : getWebLinkHost(url);
    const title = clipIdeaTitle(draft.title) || clipIdeaTitle(host ?? '');

    const now = Date.now();
    const id = chosenId ?? generateUuid();
    const photoPaths =
      draft.kind === 'PHOTO'
        ? draft.photoFiles.map((_, index) => getIdeaPhotoPath(uid, id, index))
        : [];
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
      photoPath: null,
      photoPaths,
      recipeId: null,
      by: null,
      createdAt: now,
      updatedAt: now,
    };

    const resized =
      photoPaths.length > 0 ? await resizeIdeaPhotos(draft.photoFiles) : null;
    if (resized && 'error' in resized) {
      return rejectWithValue(
        getWriteMessage(resized.error, 'Unable to save this idea.'),
      );
    }

    try {
      if (resized) {
        await Promise.all(
          resized.photos.map((photo, index) =>
            uploadFile(photoPaths[index], photo),
          ),
        );
      }
      await setDoc(ideaDoc(uid, id), idea);
    } catch (error) {
      await Promise.all(
        photoPaths.map((path) => deleteFile(path).catch(() => undefined)),
      );
      return rejectWithValue(
        getWriteMessage(error, 'Unable to save this idea.'),
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
  url: string | null;
  /** Pictures that replace the stored ones as a set; empty keeps what is stored. */
  photoFiles: File[];
}

/** Field-scoped on purpose: a recipe made from the idea in the meantime keeps its link. */
export const updateIdea = createAsyncThunk<
  string,
  UpdateIdeaInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/ideas/update',
  async (
    { uid, id, title: typedTitle, note: typedNote, url: typedUrl, photoFiles },
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

    const oldPaths = getIdeaPhotoPaths(existing);
    const isReplacing = existing.kind === 'PHOTO' && photoFiles.length > 0;
    if (isReplacing && photoFiles.length > MAX_RECIPE_FILES) {
      return rejectWithValue(
        `An idea keeps up to ${MAX_RECIPE_FILES} pictures.`,
      );
    }
    const version = Date.now();
    const photoPaths = isReplacing
      ? photoFiles.map((_, index) => getIdeaPhotoPath(uid, id, index, version))
      : oldPaths;

    try {
      if (isReplacing) {
        const resized = await resizeIdeaPhotos(photoFiles);
        if ('error' in resized) throw resized.error;
        await Promise.all(
          resized.photos.map((photo, index) =>
            uploadFile(photoPaths[index], photo),
          ),
        );
      }
      await updateDoc(ideaDoc(uid, id), {
        ...getMissingIdeaFields(existing),
        title,
        note,
        ...linkChange.fields,
        ...(existing.kind === 'PHOTO' ? { photoPath: null, photoPaths } : {}),
        updatedAt: Date.now(),
      });
      if (isReplacing) {
        await Promise.all(
          oldPaths
            .filter((path) => !photoPaths.includes(path))
            .map((path) => deleteFile(path).catch(() => undefined)),
        );
      }
    } catch (error) {
      if (isReplacing) {
        await Promise.all(
          photoPaths.map((path) => deleteFile(path).catch(() => undefined)),
        );
      }
      return rejectWithValue(
        getWriteMessage(error, 'Unable to save this idea.'),
      );
    }

    return id;
  },
);

interface RemoveIdeaInput {
  uid: string;
  id: string;
}

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

  if (existing) {
    await Promise.all(
      getIdeaPhotoPaths(existing).map((path) =>
        deleteFile(path).catch(() => undefined),
      ),
    );
  }

  return id;
});

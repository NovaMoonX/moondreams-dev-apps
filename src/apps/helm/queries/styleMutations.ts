import {
  collection,
  doc,
  getDocs,
  runTransaction,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import { generateUuid } from '@/utils';
import {
  STYLE_AVOID_LIMIT,
  STYLE_AVOID_MAX,
  STYLE_REMOVED_LIMIT,
  STYLE_TRAIT_LIMIT,
  STYLE_TRAIT_MAX,
} from '@apps/helm/constants';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { openJson, sealJson } from '@apps/helm/security';
import type { StyleProfile, StyleSealed } from '@apps/helm/types';

/** The profile the person adds notes to by hand; occasion and audience profiles come from sent mail, and their notes can be edited or removed. */
export const GENERAL_STYLE_ID = 'general';

type Trait = StyleSealed['traits'][string];

export type StyleResult =
  | { kind: 'done'; undo: (() => Promise<StyleResult>) | null }
  | { kind: 'full' | 'fullAvoid' | 'gone' | 'offline' };

type Outcome = 'done' | 'full' | 'fullAvoid' | 'gone' | 'offline';

/** Returned by a change that finds the notes already as wanted, so nothing is written. */
const UNCHANGED = 'unchanged';

const isUnavailable = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: unknown }).code === 'unavailable';

const emptySealed: StyleSealed = {
  label: 'General',
  traits: {},
  avoid: [],
  removed: [],
};

/** The form a removed note is remembered by, so the learner never brings it back in other spacing or case. */
const normalizeNote = (text: string) =>
  text.trim().replace(/\s+/g, ' ').toLowerCase();

const forgetRemoved = (removed: string[], text: string) =>
  removed.filter((entry) => entry !== normalizeNote(text));

const rememberRemoved = (removed: string[], text: string) =>
  [...forgetRemoved(removed, text), normalizeNote(text)].slice(
    -STYLE_REMOVED_LIMIT,
  );

/** Re-reads the profile inside a transaction and writes only `sealed` and the edit stamps (the whole document when it is the first note). `change` returns the new notes, or null when what it meant to change is no longer there. */
async function changeStyle(
  uid: string,
  styleId: string,
  change: (
    sealed: StyleSealed,
  ) => StyleSealed | 'full' | 'fullAvoid' | typeof UNCHANGED | null,
): Promise<Outcome> {
  if (!navigator.onLine) return 'offline';
  const encryption = await getHelmEncryption(uid);
  const ref = doc(db, 'apps', 'helm', 'users', uid, 'style', styleId);
  try {
    return await runTransaction(db, async (transaction) => {
      const current = await transaction.get(ref);
      const data = current.data() as Partial<StyleProfile> | undefined;
      const before =
        current.exists() && data?.sealed
          ? await openJson<StyleSealed>(data.sealed, encryption)
          : emptySealed;
      const next = change({
        ...before,
        label: before.label || emptySealed.label,
        traits: before.traits ?? {},
        avoid: before.avoid ?? [],
        removed: before.removed ?? [],
      });
      if (next === null) return 'gone';
      if (next === UNCHANGED) return 'done';
      if (next === 'full' || next === 'fullAvoid') return next;
      const sealed = await sealJson<StyleSealed>(next, encryption);
      const now = Date.now();
      if (current.exists()) {
        transaction.update(ref, {
          sealed,
          personEditedAt: now,
          lastEditedAt: now,
        });
      } else {
        const created: StyleProfile = {
          scope: 'general',
          audienceWhoId: null,
          learnedFrom: [],
          sampleCount: 0,
          personEditedAt: now,
          createdAt: now,
          lastEditedAt: now,
          sealed,
        };
        transaction.set(ref, created);
      }
      return 'done' as const;
    });
  } catch (error) {
    if (isUnavailable(error)) return 'offline';
    throw error;
  }
}

const toResult = (
  outcome: Outcome,
  undo: (() => Promise<StyleResult>) | null,
): StyleResult =>
  outcome === 'done' ? { kind: 'done', undo } : { kind: outcome };

/** Writes a note by hand: it is the person's, with no examples behind it. Undo takes that note out again. */
export async function addStyleTrait(
  uid: string,
  text: string,
  styleId = GENERAL_STYLE_ID,
): Promise<StyleResult> {
  const key = `you-${generateUuid()}`;
  const found = { isRepeat: false };
  const outcome = await changeStyle(uid, styleId, (sealed) => {
    found.isRepeat = Object.values(sealed.traits).some(
      (entry) => normalizeNote(entry.text) === normalizeNote(text),
    );
    return found.isRepeat
      ? UNCHANGED
      : Object.keys(sealed.traits).length >= STYLE_TRAIT_LIMIT
        ? 'full'
        : {
            ...sealed,
            traits: {
              ...sealed.traits,
              [key]: {
                text: text.trim().slice(0, STYLE_TRAIT_MAX),
                isPersonSet: true,
                exampleCount: 0,
              },
            },
            removed: forgetRemoved(sealed.removed, text),
          };
  });
  return toResult(
    outcome,
    found.isRepeat ? null : () => removeStyleTrait(uid, key, styleId),
  );
}

/** Changes a note's words; it is the person's from then on, so a later learning run never replaces it. */
export async function editStyleTrait(
  uid: string,
  key: string,
  text: string,
  styleId = GENERAL_STYLE_ID,
): Promise<StyleResult> {
  const outcome = await changeStyle(uid, styleId, (sealed) => {
    const trait = sealed.traits[key];
    if (!trait) return null;
    return {
      ...sealed,
      traits: {
        ...sealed.traits,
        [key]: {
          ...trait,
          text: text.trim().slice(0, STYLE_TRAIT_MAX),
          isPersonSet: true,
        },
      },
      removed: forgetRemoved(sealed.removed, text),
    };
  });
  return toResult(outcome, null);
}

/** Removes a note. Undo puts back only that note, and only if the key is still free. */
export async function removeStyleTrait(
  uid: string,
  key: string,
  styleId = GENERAL_STYLE_ID,
): Promise<StyleResult> {
  const previous: { trait: Trait | null } = { trait: null };
  const outcome = await changeStyle(uid, styleId, (sealed) => {
    const { [key]: removed, ...rest } = sealed.traits;
    if (!removed) return null;
    previous.trait = removed;
    return {
      ...sealed,
      traits: rest,
      removed: rememberRemoved(sealed.removed, removed.text),
    };
  });
  return toResult(outcome, () =>
    putTraitBack(uid, key, previous.trait, styleId),
  );
}

async function putTraitBack(
  uid: string,
  key: string,
  trait: Trait | null,
  styleId: string,
): Promise<StyleResult> {
  if (!trait) return { kind: 'gone' };
  const outcome = await changeStyle(uid, styleId, (sealed) =>
    Object.values(sealed.traits).some(
      (entry) => normalizeNote(entry.text) === normalizeNote(trait.text),
    )
      ? UNCHANGED
      : sealed.traits[key]
        ? null
        : Object.keys(sealed.traits).length >= STYLE_TRAIT_LIMIT
          ? 'full'
          : {
              ...sealed,
              traits: { ...sealed.traits, [key]: trait },
              removed: forgetRemoved(sealed.removed, trait.text),
            },
  );
  return toResult(outcome, null);
}

/** Rewrites one "avoid" line, found by its words; the profile counts as the person's afterwards. A line that now repeats another is dropped. */
export async function editStyleAvoid(
  uid: string,
  line: string,
  text: string,
  styleId = GENERAL_STYLE_ID,
): Promise<StyleResult> {
  const next = text.trim().slice(0, STYLE_AVOID_MAX);
  const outcome = await changeStyle(uid, styleId, (sealed) => {
    if (!sealed.avoid.includes(line)) return null;
    const isRepeat = sealed.avoid.some(
      (entry) => entry !== line && normalizeNote(entry) === normalizeNote(next),
    );
    return {
      ...sealed,
      avoid: isRepeat
        ? sealed.avoid.filter((entry) => entry !== line)
        : sealed.avoid.map((entry) => (entry === line ? next : entry)),
      removed: forgetRemoved(sealed.removed, next),
    };
  });
  return toResult(outcome, null);
}

/** Removes one "avoid" line. Undo puts it back at its place, if it is still absent. */
export async function removeStyleAvoid(
  uid: string,
  line: string,
  styleId = GENERAL_STYLE_ID,
): Promise<StyleResult> {
  const previous: { index: number } = { index: -1 };
  const outcome = await changeStyle(uid, styleId, (sealed) => {
    previous.index = sealed.avoid.indexOf(line);
    return previous.index < 0
      ? null
      : {
          ...sealed,
          avoid: sealed.avoid.filter((entry) => entry !== line),
          removed: rememberRemoved(sealed.removed, line),
        };
  });
  const undo = async (): Promise<StyleResult> => {
    const undone = await changeStyle(uid, styleId, (sealed) =>
      sealed.avoid.some((entry) => normalizeNote(entry) === normalizeNote(line))
        ? UNCHANGED
        : sealed.avoid.length >= STYLE_AVOID_LIMIT
          ? 'fullAvoid'
          : {
              ...sealed,
              avoid: [
                ...sealed.avoid.slice(0, previous.index),
                line,
                ...sealed.avoid.slice(previous.index),
              ],
              removed: forgetRemoved(sealed.removed, line),
            },
    );
    return toResult(undone, null);
  };
  return toResult(outcome, undo);
}

/** Deletes every profile learned from sent mail in one batch, keeping the documents as they were. Undo writes them back; `null` when there was nothing to remove. */
export async function removeMailStyles(
  uid: string,
): Promise<{ undo: () => Promise<void> } | null> {
  const styles = collection(db, 'apps', 'helm', 'users', uid, 'style');
  const snapshot = await getDocs(styles);
  const kept = snapshot.docs
    .map((entry) => ({ id: entry.id, data: entry.data() }))
    .filter(({ data }) =>
      Array.isArray(data.learnedFrom)
        ? data.learnedFrom.includes('sentMail')
        : false,
    );
  if (kept.length === 0) return null;
  const batch = writeBatch(db);
  kept.forEach(({ id }) => batch.delete(doc(styles, id)));
  await batch.commit();
  return {
    undo: async () => {
      const restore = writeBatch(db);
      kept.forEach(({ id, data }) => restore.set(doc(styles, id), data));
      await restore.commit();
    },
  };
}

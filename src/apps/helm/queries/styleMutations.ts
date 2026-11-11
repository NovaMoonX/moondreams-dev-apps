import { doc, runTransaction } from 'firebase/firestore';

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

/** The one profile the person edits by hand; occasion and audience profiles come only from sent mail. */
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
  change: (
    sealed: StyleSealed,
  ) => StyleSealed | 'full' | 'fullAvoid' | typeof UNCHANGED | null,
): Promise<Outcome> {
  if (!navigator.onLine) return 'offline';
  const encryption = await getHelmEncryption(uid);
  const ref = doc(db, 'apps', 'helm', 'users', uid, 'style', GENERAL_STYLE_ID);
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
): Promise<StyleResult> {
  const key = `you-${generateUuid()}`;
  const found = { isRepeat: false };
  const outcome = await changeStyle(uid, (sealed) => {
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
    found.isRepeat ? null : () => removeStyleTrait(uid, key),
  );
}

/** Changes a note's words; it is the person's from then on, so a later learning run never replaces it. */
export async function editStyleTrait(
  uid: string,
  key: string,
  text: string,
): Promise<StyleResult> {
  const outcome = await changeStyle(uid, (sealed) => {
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
): Promise<StyleResult> {
  const previous: { trait: Trait | null } = { trait: null };
  const outcome = await changeStyle(uid, (sealed) => {
    const { [key]: removed, ...rest } = sealed.traits;
    if (!removed) return null;
    previous.trait = removed;
    return {
      ...sealed,
      traits: rest,
      removed: rememberRemoved(sealed.removed, removed.text),
    };
  });
  return toResult(outcome, () => putTraitBack(uid, key, previous.trait));
}

async function putTraitBack(
  uid: string,
  key: string,
  trait: Trait | null,
): Promise<StyleResult> {
  if (!trait) return { kind: 'gone' };
  const outcome = await changeStyle(uid, (sealed) =>
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
): Promise<StyleResult> {
  const next = text.trim().slice(0, STYLE_AVOID_MAX);
  const outcome = await changeStyle(uid, (sealed) => {
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
): Promise<StyleResult> {
  const previous: { index: number } = { index: -1 };
  const outcome = await changeStyle(uid, (sealed) => {
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
    const undone = await changeStyle(uid, (sealed) =>
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

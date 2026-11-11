import { doc, runTransaction } from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import { generateUuid } from '@/utils';
import {
  STYLE_AVOID_MAX,
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
  | { kind: 'full' | 'gone' | 'offline' };

const isUnavailable = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: unknown }).code === 'unavailable';

const emptySealed: StyleSealed = { label: 'General', traits: {}, avoid: [] };

/** Re-reads the profile inside a transaction and writes only `sealed` and the edit stamps (the whole document when it is the first note). `change` returns the new notes, or null when what it meant to change is no longer there. */
async function changeStyle(
  uid: string,
  change: (sealed: StyleSealed) => StyleSealed | 'full' | null,
): Promise<'done' | 'full' | 'gone' | 'offline'> {
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
        label: before.label || emptySealed.label,
        traits: before.traits ?? {},
        avoid: before.avoid ?? [],
      });
      if (next === 'full' || next === null) return next ?? 'gone';
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
  outcome: 'done' | 'full' | 'gone' | 'offline',
  undo: (() => Promise<StyleResult>) | null,
): StyleResult =>
  outcome === 'done' ? { kind: 'done', undo } : { kind: outcome };

/** Writes a note by hand: it is the person's, with no examples behind it. Undo takes that note out again. */
export async function addStyleTrait(
  uid: string,
  text: string,
): Promise<StyleResult> {
  const key = `you-${generateUuid()}`;
  const outcome = await changeStyle(uid, (sealed) =>
    Object.keys(sealed.traits).length >= STYLE_TRAIT_LIMIT
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
        },
  );
  return toResult(outcome, () => removeStyleTrait(uid, key));
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
    return { ...sealed, traits: rest };
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
    sealed.traits[key]
      ? null
      : Object.keys(sealed.traits).length >= STYLE_TRAIT_LIMIT
        ? 'full'
        : { ...sealed, traits: { ...sealed.traits, [key]: trait } },
  );
  return toResult(outcome, null);
}

/** Rewrites one "avoid" line, found by its words; the profile counts as the person's afterwards. */
export async function editStyleAvoid(
  uid: string,
  line: string,
  text: string,
): Promise<StyleResult> {
  const outcome = await changeStyle(uid, (sealed) =>
    sealed.avoid.includes(line)
      ? {
          ...sealed,
          avoid: sealed.avoid.map((entry) =>
            entry === line ? text.trim().slice(0, STYLE_AVOID_MAX) : entry,
          ),
        }
      : null,
  );
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
      : { ...sealed, avoid: sealed.avoid.filter((entry) => entry !== line) };
  });
  const undo = async (): Promise<StyleResult> => {
    const undone = await changeStyle(uid, (sealed) =>
      sealed.avoid.includes(line)
        ? null
        : {
            ...sealed,
            avoid: [
              ...sealed.avoid.slice(0, previous.index),
              line,
              ...sealed.avoid.slice(previous.index),
            ],
          },
    );
    return toResult(undone, null);
  };
  return toResult(outcome, undo);
}

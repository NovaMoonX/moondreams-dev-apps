import type { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { toComparable } from '../../vendor/optionMatchUtils.js';
import { merchantDocId } from './merchantNames.js';
import { toHttpsUrl } from './link/normalize.js';

/**
 * The one bank-logo list every Runway plan shares, readable only by Functions (no rule matches this path). A document
 * holds a bank's public name and logo and when it was last seen, never a person, account, amount or count of people.
 */
export const INSTITUTION_LOGOS_PATH = 'apps/runway/institutionLogos';

const MIN_KEY_LENGTH = 3;
const MAX_LOGO_LENGTH = 200_000;

export interface InstitutionLogoDoc {
  name: string;
  logo: string;
  seenAt: number;
}

const COMPANY_ENDING = / (?:n a|na|bank|inc|llc|corp|corporation)$/;

const hasLetters = (key: string) =>
  key.replace(/ /g, '').length >= MIN_KEY_LENGTH;

const withoutEndings = (key: string): string => {
  const next = key.replace(COMPANY_ENDING, '');
  return next !== key && hasLetters(next) ? withoutEndings(next) : key;
};

/** The text a bank is looked up by: compared like a shop's, with trailing legal endings ("N.A.", "Inc", "Bank") dropped while three or more letters remain, so "Capital One, N.A." and "Capital One" meet while "US Bank" and "TD Bank" stay whole. Null when too little is left to mean one bank. */
export function toInstitutionKey(text: string | null | undefined) {
  if (typeof text !== 'string') return null;
  const key = withoutEndings(toComparable(text));
  return hasLetters(key) ? key : null;
}

/** A logo worth keeping: an https address or a base64 image, nothing else. */
export const toSafeLogo = (value: unknown) =>
  typeof value === 'string' &&
  value.length < MAX_LOGO_LENGTH &&
  /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value)
    ? value
    : toHttpsUrl(typeof value === 'string' ? value : null);

/** Keeps the list current from a bank logo a link recorded, under each name the bank goes by. Never throws: a link must not wait on or fail for it. */
export async function learnInstitutionLogo(
  firestore: Firestore,
  names: readonly (string | null | undefined)[],
  logo: string | null | undefined,
  now: number,
) {
  const safeLogo = toSafeLogo(logo);
  if (safeLogo === null) return;
  try {
    const entries = [
      ...names
        .flatMap((name) => {
          const key = toInstitutionKey(name);
          return key === null || typeof name !== 'string'
            ? []
            : [{ id: merchantDocId(key), name: name.trim().slice(0, 100) }];
        })
        .reduce(
          (byId, entry) =>
            byId.has(entry.id) ? byId : byId.set(entry.id, entry.name),
          new Map<string, string>(),
        ),
    ];
    await Promise.all(
      entries.map(async ([id, name]) => {
        const ref = firestore.doc(`${INSTITUTION_LOGOS_PATH}/${id}`);
        const stored = (await ref.get()).data() as
          Partial<InstitutionLogoDoc> | undefined;
        if (stored?.logo === safeLogo) return;
        await ref.set({
          name: typeof stored?.name === 'string' ? stored.name : name,
          logo: safeLogo,
          seenAt: now,
        } satisfies InstitutionLogoDoc);
      }),
    );
  } catch {
    logger.warn('runway.institutionLogos.learnFailed');
  }
}

/** The list's entry for a bank named in an email, or null when there is none or the list can't be read. */
export async function findInstitutionLogo(
  firestore: Firestore,
  name: string | null | undefined,
): Promise<{ name: string; logo: string } | null> {
  const key = toInstitutionKey(name);
  if (key === null) return null;
  try {
    const found = (
      await firestore
        .doc(`${INSTITUTION_LOGOS_PATH}/${merchantDocId(key)}`)
        .get()
    ).data() as Partial<InstitutionLogoDoc> | undefined;
    const logo = toSafeLogo(found?.logo);
    return found && typeof found.name === 'string' && found.name !== '' && logo
      ? { name: found.name, logo }
      : null;
  } catch {
    logger.warn('runway.institutionLogos.lookupFailed');
    return null;
  }
}

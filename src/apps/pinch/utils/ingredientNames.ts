import { toDisplayCase } from '@/utils/optionMatchUtils';

/** Words that say how an ingredient is cut or kept, never which one it is, so a read name hands them to the line's note, along with an "and" or "or" joining them. A word that can make a different product (diced, crushed, shredded, peeled tomatoes) stays in the name. */
const PREP_PATTERN =
  /(?:\s+(?:and|or)\s+)?\b(?:bone[\s-]*in|skin[\s-]*on|boneless|skinless|trimmed|deveined|pitted|cored|seeded|rinsed|drained|softened|melted)\b/gi;

export interface SplitName {
  name: string;
  prep: string[];
}

const tidy = (text: string) =>
  text
    .replace(/\(\s*\)|\[\s*\]/g, ' ')
    .replace(/(^|\s)[,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;:.-]+|[\s,;:.-]+$/g, '')
    .replace(/^(?:and|or|with)\s+|[\s,;:]+(?:and|or|with)$/gi, '')
    .replace(/^[\s,;:.-]+|[\s,;:.-]+$/g, '');

export const splitPrep = (name: string): SplitName => {
  const prep = Array.from(name.matchAll(PREP_PATTERN), ([match]) =>
    match
      .replace(/^\s+(?:and|or)\s+/i, '')
      .toLowerCase()
      .replace(/[\s-]+/g, '-'),
  );
  const cleaned = tidy(name.replace(PREP_PATTERN, ' '));

  return cleaned === ''
    ? { name: name.trim(), prep: [] }
    : { name: cleaned, prep };
};

/** An ingredient's name the way the app writes them: "Chicken thigh", a short all-capitals word such as BBQ kept as it is. */
export const toIngredientName = (name: string) =>
  toDisplayCase(tidy(name), { keepAcronyms: true });

/** `toIngredientName` for a name a person typed: one that mixes cases ("KitKat bar") was written on purpose and stays. */
export const toTypedIngredientName = (name: string) =>
  toDisplayCase(tidy(name), { keepAcronyms: true, keepMixedCase: true });

export const addPrepToNote = (note: string | null, prep: string[]) => {
  const have = ` ${(note ?? '').toLowerCase().replace(/[^a-z]+/g, ' ')} `;
  const added = prep.filter(
    (word) => !have.includes(` ${word.replace(/-/g, ' ')} `),
  );
  const joined = [note, ...added].filter(Boolean).join(', ');

  return joined === '' ? null : joined;
};

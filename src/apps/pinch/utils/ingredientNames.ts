import { toDisplayCase } from '@/utils/optionMatchUtils';

/** Words that say how an ingredient is cut or kept, never which one it is, so a read name hands them to the line's note. A word that can make a different product (diced, crushed, shredded) stays in the name. */
const PREP_PATTERN =
  /\b(?:bone[\s-]?in|skin[\s-]?on|boneless|skinless|trimmed|peeled|deveined|pitted|cored|seeded|rinsed|drained|softened|melted)\b/gi;

export interface SplitName {
  name: string;
  prep: string[];
}

const tidy = (text: string) =>
  text
    .replace(/(^|\s)[,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;:.-]+|[\s,;:.-]+$/g, '');

export const splitPrep = (name: string): SplitName => {
  const prep: string[] = [];
  const rest = name.replace(PREP_PATTERN, (match) => {
    prep.push(match.toLowerCase().replace(/\s+/g, '-'));
    return ' ';
  });
  const cleaned = tidy(rest);

  return cleaned === ''
    ? { name: name.trim(), prep: [] }
    : { name: cleaned, prep };
};

/** An ingredient's name the way the app writes them: "Chicken thigh", a short all-capitals word such as BBQ kept as it is. */
export const toIngredientName = (name: string) =>
  toDisplayCase(tidy(name), { keepAcronyms: true });

export const addPrepToNote = (note: string | null, prep: string[]) => {
  const have = (note ?? '').toLowerCase();
  const added = prep.filter((word) => !have.includes(word));
  const joined = [note, ...added].filter(Boolean).join(', ');

  return joined === '' ? null : joined;
};

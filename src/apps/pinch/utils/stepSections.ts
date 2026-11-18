import { clipAtWord } from '@/utils/stringUtils';
import { MAX_STEP_SECTION_LENGTH } from '@apps/pinch/constants';

export interface StepSectionBlock {
  /** The section's name ignoring case and spacing with its first step's index, so two runs of one name stay apart; `''`-prefixed for steps in no section. */
  key: string;
  /** The name as its first step spells it; null for steps in no section. */
  name: string | null;
  /** Each step with its place in the whole recipe, so numbers run through every section. */
  steps: { text: string; index: number }[];
}

/** A section name as it is stored: inner spaces collapsed, trimmed and cut at a word under the cap; a blank one is no section. */
export const cleanStepSection = (text: string | null | undefined) => {
  const plain = (text ?? '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s#*_-]+|[\s.,;:!?#*_-]+$/g, '')
    .trim();
  const result = plain === '' ? null : clipAtWord(plain, MAX_STEP_SECTION_LENGTH);
  return result === '' ? null : result;
};

/** The section key two spellings share: case and spacing ignored. */
export const getStepSectionKey = (name: string | null | undefined) =>
  cleanStepSection(name)?.toLowerCase() ?? '';

/** Every step's section, index for index with the steps: a recipe from before sections, a short list or a blank entry reads as null. */
export const getStepSections = (recipe: {
  steps: string[];
  stepSections?: (string | null)[] | null;
}): (string | null)[] =>
  recipe.steps.map((_, index) =>
    cleanStepSection(recipe.stepSections?.[index] ?? null),
  );

/** The steps as runs of one section, in order: consecutive steps with the same section are one block, and a recipe with no sections is one block with no name. */
export const groupStepSections = (
  steps: string[],
  sections: (string | null)[] | null | undefined,
): StepSectionBlock[] =>
  steps.reduce<StepSectionBlock[]>((blocks, text, index) => {
    const name = cleanStepSection(sections?.[index] ?? null);
    const sectionKey = getStepSectionKey(name);
    const last = blocks[blocks.length - 1];
    if (last && getStepSectionKey(last.name) === sectionKey) {
      return [
        ...blocks.slice(0, -1),
        { ...last, steps: [...last.steps, { text, index }] },
      ];
    }
    return [
      ...blocks,
      { key: `${sectionKey}:${index}`, name, steps: [{ text, index }] },
    ];
  }, []);

/** True when any step sits in a section. */
export const hasStepSections = (
  steps: string[],
  sections: (string | null)[] | null | undefined,
) => steps.some((_, index) => cleanStepSection(sections?.[index] ?? null) !== null);

/** Where step `index` sits in its section: the section's name, which step of it this is, and how many it has; null for a step in no section. */
export const getStepSectionPlace = (
  steps: string[],
  sections: (string | null)[] | null | undefined,
  index: number,
) => {
  const block = groupStepSections(steps, sections).find((entry) =>
    entry.steps.some((step) => step.index === index),
  );
  if (!block || block.name === null) return null;
  return {
    name: block.name,
    position: block.steps.findIndex((step) => step.index === index) + 1,
    count: block.steps.length,
  };
};

/** The sections stored with a recipe: one entry per step, trimmed and capped, and `[]` when no step has one, so a recipe with no sections stores nothing new. */
export const toStoredStepSections = (
  steps: string[],
  sections: (string | null)[] | null | undefined,
): (string | null)[] =>
  hasStepSections(steps, sections)
    ? steps.map((_, index) => cleanStepSection(sections?.[index] ?? null))
    : [];

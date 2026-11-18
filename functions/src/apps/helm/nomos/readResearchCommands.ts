import {
  MAX_RESEARCH_PER_TURN,
  RESEARCH_QUESTION_CAP,
  RESEARCH_SUBJECT_CAP,
  type ResearchCommand,
} from './commands.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toWords = (value: unknown, cap: number) => {
  if (typeof value !== 'string') return null;
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat === '' ? null : flat.slice(0, cap).trim();
};

/** The web look-ups a reply asks for, each with its words capped; one a turn, since each spends the month's allowance. */
export function readResearchCommands(items: unknown[]): ResearchCommand[] {
  return items
    .filter(isRecord)
    .filter((item) => item.kind === 'research')
    .flatMap((item): ResearchCommand[] => {
      const question = toWords(item.researchQuestion, RESEARCH_QUESTION_CAP);
      if (question === null) return [];
      const subject =
        toWords(item.researchSubject, RESEARCH_SUBJECT_CAP) ??
        question.slice(0, RESEARCH_SUBJECT_CAP).trim();
      return [
        {
          kind: 'research',
          question,
          subject,
          depth:
            item.researchDepth === 'light' || item.researchDepth === 'thorough'
              ? item.researchDepth
              : null,
          isDecision: item.researchIsDecision === true,
        },
      ];
    })
    .slice(0, MAX_RESEARCH_PER_TURN);
}

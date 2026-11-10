import { createOptionMatcher } from '@/utils/optionMatchUtils';
import type { HelmQuestion } from '@apps/helm/types';
import { normalizeSaid } from '@apps/helm/utils/voicePhrases';

export type SpokenAnswer =
  { kind: 'option'; optionId: string } | { kind: 'skip' };

interface Choice {
  answer: SpokenAnswer;
  names: string[];
}

const ORDINALS = ['first', 'second', 'third', 'fourth'];
const NEW_NAMES = ['someone new', 'new', 'a new one', 'new one', 'new person'];
const NONE_NAMES = [
  'nobody',
  'no one',
  'none',
  "don't link anyone",
  "don't link",
  'neither',
];

const matcher = createOptionMatcher<Choice>({
  names: (choice) => choice.names,
  ignoreTypedWords: new Set(['the', 'please', 'link', 'it', 'to']),
  typos: false,
});

/** What a spoken answer picks from an open question: a candidate by its name, what tells it apart or its place in the list, a new one, nobody, or Skip. A reply that is not clearly one of them is `null`, so it is sent as a turn. */
export function matchSpokenAnswer(
  text: string,
  question: HelmQuestion,
): SpokenAnswer | null {
  const candidates = question.options.filter((option) => option.ref !== null);
  const tokensOf = (label: string) => normalizeSaid(label).split(' ');
  const uniqueTokens = (label: string) =>
    tokensOf(label).filter(
      (token) =>
        token !== '' &&
        candidates.every(
          (other) =>
            other.label === label || !tokensOf(other.label).includes(token),
        ),
    );
  const choices: Choice[] = [
    ...candidates.map((option, index) => ({
      answer: { kind: 'option' as const, optionId: option.id },
      names: [
        option.label,
        ...uniqueTokens(option.label),
        ...(option.detail ? [option.detail] : []),
        ORDINALS[index],
        `${ORDINALS[index]} one`,
      ].filter(Boolean),
    })),
    ...question.options
      .filter((option) => option.id === 'new')
      .map((option) => ({
        answer: { kind: 'option' as const, optionId: option.id },
        names: [option.label, ...NEW_NAMES],
      })),
    ...question.options
      .filter((option) => option.id === 'none')
      .map((option) => ({
        answer: { kind: 'option' as const, optionId: option.id },
        names: [option.label, ...NONE_NAMES],
      })),
    { answer: { kind: 'skip' as const }, names: ['skip', 'skip it'] },
  ];
  return matcher.match(normalizeSaid(text), choices)?.answer ?? null;
}

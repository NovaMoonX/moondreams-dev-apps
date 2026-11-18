import assert from 'node:assert/strict';

import {
  readSpokenAnswer,
  type SpokenQuestion,
} from '../../src/lib/speech/readSpokenAnswer.ts';

const ask = (
  shape: SpokenQuestion['shape'],
  labels: string[],
  aliases: string[][] = [],
): SpokenQuestion => ({
  shape,
  options: labels.map((label, index) => ({
    id: `o${index}`,
    label,
    detail: null,
    aliases: aliases[index],
  })),
  noneOptionId: null,
  allowsSomethingElse: false,
  number: null,
  dateMode: null,
});

const read = (question: SpokenQuestion, text: string) =>
  readSpokenAnswer(question, text, { readDate: () => null });

const picked = (question: SpokenQuestion, text: string) => {
  const answer = read(question, text);
  if (answer?.kind !== 'answer') return answer?.kind ?? null;
  const { value } = answer;
  if (value.shape === 'pickSeveral') return value.optionIds.join(',');
  return 'optionId' in value ? value.optionId : null;
};

const windows = ask('pickOne', ['Pills · morning', 'Pills · evening']);
const several = ask('pickSeveral', ['Pills', 'Vitamin D']);
const whose = ask(
  'pickOne',
  ['Your pills', "Mom's metoprolol"],
  [['mine'], ['mom', "mom's"]],
);
const yesNo = ask('yesNo', ['Yes', 'No']);

const cases: [SpokenQuestion, string, string | null][] = [
  [windows, 'the first one', 'o0'],
  [windows, 'the second', 'o1'],
  [windows, 'evening', 'o1'],
  [windows, 'the evening one', 'o1'],
  [windows, 'the morning ones', 'o0'],
  [windows, 'skip', 'skip'],
  [windows, 'the evening one, and remind me tomorrow', null],
  [several, 'both', 'o0,o1'],
  [several, 'all of them', 'o0,o1'],
  [several, 'the first', 'o0'],
  [whose, "mom's", 'o1'],
  [whose, 'mine', 'o0'],
  [yesNo, 'yeah', 'yes'],
  [yesNo, 'nope', 'no'],
];

cases.forEach(([question, text, expected]) =>
  assert.equal(picked(question, text), expected, `"${text}"`),
);

const withNone: SpokenQuestion = {
  ...several,
  options: [
    ...several.options,
    { id: 'none', label: 'None of these', detail: null },
  ],
  noneOptionId: 'none',
};
assert.equal(
  picked(withNone, 'neither'),
  'none',
  '"neither" with a none option',
);
assert.equal(picked(withNone, 'none'), 'none', '"none" with a none option');

console.log(`speech choice: ${cases.length + 2} answers read as expected`);

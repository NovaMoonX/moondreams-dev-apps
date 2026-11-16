import assert from 'node:assert/strict';

import {
  OPEN_QUESTION_MS,
  isSpokenTurn,
  pickQuestionTurn,
} from '../../src/apps/helm/utils/openQuestion.ts';

type Turn = {
  id: string;
  inputMode: 'typed' | 'voice' | 'attachment';
  answersQuestion: unknown;
  createdAt: number;
  sortedAt: number | null;
};

const at = 1_700_000_000_000;
const turn = (
  id: string,
  inputMode: Turn['inputMode'],
  sortedAt: number,
  answersQuestion: unknown = null,
): Turn => ({
  id,
  inputMode,
  answersQuestion,
  createdAt: sortedAt - 2000,
  sortedAt,
});

const asked = turn('asked', 'voice', at);
const typedAfter = turn('typed', 'typed', at + 20_000);
const answer = turn('answer', 'voice', at + 30_000, {
  captureId: 'asked',
  questionId: 'q',
});
const pick = (turns: Turn[], route: 'typed' | 'spoken' | 'wake', now: number) =>
  pickQuestionTurn(turns, route, now)?.id ?? null;

assert.equal(
  pick([asked], 'spoken', at + 5000),
  'asked',
  'a spoken answer goes to the spoken question',
);
assert.equal(
  pick([asked, typedAfter], 'spoken', at + 25_000),
  'asked',
  'a typed message leaves the spoken question open',
);
assert.equal(
  pick([asked, typedAfter], 'wake', at + 60_000),
  'asked',
  'the wake phrase answers it within two minutes',
);
assert.equal(
  pick([asked, typedAfter], 'wake', at + OPEN_QUESTION_MS + 1),
  null,
  'after two minutes the wake phrase starts a new turn',
);
assert.equal(
  pick([asked, typedAfter], 'typed', at + 25_000),
  'typed',
  'a typed answer goes to the latest turn',
);
assert.equal(
  pick([asked, answer], 'spoken', at + 35_000),
  'asked',
  'an answer turn is never the asking one',
);
assert.equal(
  pick([typedAfter], 'spoken', at + 25_000),
  null,
  'a typed turn opens nothing to answer by voice',
);

const open = { isOpen: true, isMuted: false };
const closed = { isOpen: false, isMuted: false };
const muted = { isOpen: true, isMuted: true };
const spokenCases: [
  Parameters<typeof isSpokenTurn>[0],
  typeof open,
  boolean,
  string,
][] = [
  ['spoken', closed, true, 'a spoken turn is spoken on any page'],
  ['typed', open, false, 'a typed turn is written even mid-conversation'],
  [
    'tap',
    open,
    true,
    'a tap while a spoken conversation is open is answered aloud',
  ],
  ['tap', closed, false, 'a tap with no conversation open is written'],
  ['spoken', muted, false, 'Mute ends the spoken turn'],
  ['tap', muted, false, 'a tap while muted is written'],
];
spokenCases.forEach(([route, conversation, expected, message]) =>
  assert.equal(isSpokenTurn(route, conversation), expected, message),
);

console.log(
  `helm voice turn: 7 routes picked, ${spokenCases.length} turns marked spoken or written as expected`,
);

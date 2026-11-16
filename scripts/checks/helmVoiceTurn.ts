import assert from 'node:assert/strict';

import {
  OPEN_QUESTION_MS,
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

console.log('helm voice turn: 7 routes picked as expected');

import assert from 'node:assert/strict';

import { getStatementMinimum } from '../../src/apps/runway/engine/cards.ts';
import type { OpenCardStatement } from '../../src/apps/runway/types.ts';

const d = (year: number, month: number, day: number) =>
  Date.UTC(year, month - 1, day);

const statement = (
  patch: Partial<OpenCardStatement> = {},
): OpenCardStatement => ({
  id: 'v',
  asOf: 1,
  minimumCents: 3_500,
  statementCents: 41_200,
  statementOn: d(2026, 10, 24),
  dueOn: d(2026, 11, 14),
  lastPaymentCents: null,
  lastPaymentOn: null,
  ...patch,
});

assert.deepEqual(getStatementMinimum(statement()), {
  kind: 'due',
  cents: 3_500,
  dueOn: d(2026, 11, 14),
});
assert.deepEqual(
  getStatementMinimum(
    statement({ lastPaymentCents: 41_200, lastPaymentOn: d(2026, 11, 2) }),
  ),
  { kind: 'paid', cents: 3_500, paidCents: 41_200, paidOn: d(2026, 11, 2) },
  'a card paid in full since the statement shows its minimum as paid, not as nothing',
);
assert.deepEqual(
  getStatementMinimum(
    statement({ lastPaymentCents: 90_000, lastPaymentOn: d(2026, 10, 23) }),
  ),
  { kind: 'due', cents: 3_500, dueOn: d(2026, 11, 14) },
  'a payment before the statement was issued is for the one before',
);
assert.deepEqual(getStatementMinimum(statement({ minimumCents: 0 })), {
  kind: 'none',
});
assert.deepEqual(getStatementMinimum(statement({ minimumCents: null })), {
  kind: 'notShared',
});
assert.deepEqual(
  getStatementMinimum(statement({ dueOn: null })),
  { kind: 'due', cents: 3_500, dueOn: null },
  'a minimum with no due date still shows',
);

console.log('runway card statements: ok');

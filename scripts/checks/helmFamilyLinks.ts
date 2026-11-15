// Family links worked out from what is stored: each rule, nothing for friends or work, a stored link or a refusal always wins, dating and past couples imply nothing, private people and pets are left out, and 200 people with 400 connections take well under 50 ms.
import assert from 'node:assert/strict';

import * as server from '../../functions/src/apps/helm/nomos/connections.ts';
import type { KinKind } from '../../src/apps/helm/engine/kinKinds.ts';
import {
  inferFamilyLinks,
  type ConnectionKind,
  type ConnectionRelation,
  type CoupleStatus,
  type InferConnectionState,
  type InferPerson,
} from '../../src/apps/helm/engine/connections.ts';

const who = (
  id: string,
  kin: KinKind | null = null,
  extra: Partial<InferPerson> = {},
): InferPerson => ({
  id,
  kin: kin ? { kind: kin } : null,
  isPrivate: false,
  isPerson: true,
  ...extra,
});

const link = (
  whoIds: [string, string],
  kind: ConnectionKind,
  fromFirst: ConnectionRelation | null,
  fromSecond: ConnectionRelation | null,
  extra: Partial<InferConnectionState> = {},
): InferConnectionState => ({
  whoIds,
  kind,
  source: 'said',
  fromFirst,
  fromSecond,
  status: null,
  isUnreadable: false,
  ...extra,
});

const couple = (
  whoIds: [string, string],
  status: CoupleStatus | null,
  extra: Partial<InferConnectionState> = {},
) => link(whoIds, 'couple', 'partner', 'partner', { status, ...extra });

const run = (
  people: InferPerson[],
  connections: InferConnectionState[] = [],
  selfId: string | null = 'me',
) => inferFamilyLinks({ selfId, people, connections });

const brief = (links: ReturnType<typeof run>) =>
  links.map((entry) => [
    entry.firstId,
    entry.secondId,
    entry.relationOfFirstToSecond,
    entry.because,
  ]);

const me = who('me');

// Two of the owner's siblings are siblings of each other.
const siblings = run([me, who('maya', 'sister'), who('eli', 'brother')]);
assert.deepEqual(brief(siblings), [['maya', 'eli', 'sister', 'siblings']]);
assert.deepEqual(siblings[0].chain, [
  { fromId: 'maya', toId: 'me', relation: 'sister' },
  { fromId: 'eli', toId: 'me', relation: 'brother' },
]);
assert.equal(
  run(
    [me, who('maya'), who('eli', 'brother')],
    [link(['maya', 'me'], 'family', 'sibling', 'sibling')],
  )[0].because,
  'siblings',
  'a stored sibling word counts like the family word on the person',
);

// Two people with the same stored parent are siblings.
const sameParent = run(
  [me, who('joan', 'mother'), who('eli')],
  [link(['eli', 'joan'], 'family', 'son', 'mother')],
);
assert.deepEqual(brief(sameParent), [['me', 'eli', 'sibling', 'sameParent']]);
assert.equal(sameParent[0].chain.length, 2);

// A parent's sibling is an aunt or uncle, with their own gender; an unknown gender has no word.
assert.deepEqual(
  brief(
    run(
      [me, who('joan', 'mother'), who('ruth')],
      [link(['joan', 'ruth'], 'family', 'sibling', 'sibling')],
    ),
  ),
  [['ruth', 'me', null, 'auntUncle']],
  'an aunt or uncle of unknown gender has no neutral word',
);
const auntOfChild = run(
  [me, who('joan', 'mother'), who('ruth', 'aunt'), who('kid')],
  [
    link(['joan', 'kid'], 'family', 'mother', 'daughter'),
    link(['joan', 'ruth'], 'family', 'sister', 'sister'),
  ],
);
assert.deepEqual(
  auntOfChild.find((entry) => entry.because === 'auntUncle')
    ?.relationOfFirstToSecond,
  'aunt',
);
assert.equal(
  run([me, who('joan', 'mother'), who('bo', 'uncle')]).length,
  0,
  'a stored aunt or uncle needs nothing worked out',
);

// A stored word is its person's own: a stored sister is a woman, so her niece's word for her is aunt.
assert.deepEqual(
  brief(
    run(
      [me, who('joan', 'mother'), who('ruth')],
      [link(['ruth', 'joan'], 'family', 'sister', 'sister')],
    ),
  ),
  [['ruth', 'me', 'aunt', 'auntUncle']],
);

// A worked-out aunt (a parent's stored sister) and an aunt's child (a cousin), the cousin's chain running through the aunt.
const family = [me, who('joan', 'mother'), who('ruth'), who('lee')];
const familyLinks = [
  link(['joan', 'ruth'], 'family', 'sister', 'sister'),
  link(['lee', 'ruth'], 'family', 'son', 'mother'),
];
const worked = run(family, familyLinks);
const ruthIsAunt = worked.find((entry) => entry.because === 'auntUncle');
assert.deepEqual(
  [
    ruthIsAunt?.firstId,
    ruthIsAunt?.secondId,
    ruthIsAunt?.relationOfFirstToSecond,
  ],
  ['ruth', 'me', 'aunt'],
);
const cousin = worked.find((entry) => entry.because === 'cousin');
assert.deepEqual(
  [cousin?.firstId, cousin?.secondId, cousin?.relationOfFirstToSecond],
  ['lee', 'me', 'cousin'],
);
assert.equal(cousin?.chain.length, 3);
assert.deepEqual(
  cousin?.chain.map((step) => step.relation),
  ['mother', 'sister', 'son'],
);

// A stored aunt's child is a cousin (one step through the aunt).
const storedAunt = run(
  [me, who('ruth', 'aunt'), who('lee')],
  [link(['lee', 'ruth'], 'family', 'son', 'mother')],
);
assert.deepEqual(brief(storedAunt), [['lee', 'me', 'cousin', 'cousin']]);
assert.equal(storedAunt[0].chain.length, 2);

// A parent's parent is a grandparent.
const grandparent = run(
  [me, who('joan', 'mother'), who('ada')],
  [link(['ada', 'joan'], 'family', 'mother', 'daughter')],
);
assert.deepEqual(brief(grandparent), [
  ['ada', 'me', 'grandmother', 'grandparent'],
]);
assert.deepEqual(
  grandparent[0].chain.map((step) => [step.fromId, step.toId]),
  [
    ['joan', 'me'],
    ['ada', 'joan'],
  ],
);

// A sibling's spouse is a sibling-in-law; dating, engaged and past couples imply nothing.
const eliWed = (status: CoupleStatus | null) =>
  run(
    [me, who('eli', 'brother'), who('sam')],
    [couple(['eli', 'sam'], status)],
  );
assert.deepEqual(brief(eliWed('married')), [
  ['sam', 'me', 'siblingInLaw', 'siblingsPartner'],
]);
assert.equal(eliWed(null).length, 1, 'an unknown status counts');
(['dating', 'engaged', 'separated', 'divorced', 'widowed'] as const).forEach(
  (status) =>
    assert.equal(eliWed(status).length, 0, `${status} implies nothing`),
);
assert.equal(
  run(
    [me, who('eli', 'brother'), who('sam')],
    [couple(['eli', 'sam'], 'married', { source: 'refused' })],
  ).length,
  0,
  'a refused couple implies nothing',
);

// A parent's spouse who is not a parent is a stepparent.
const step = run(
  [me, who('joan', 'mother'), who('sam')],
  [couple(['joan', 'sam'], 'married')],
);
assert.deepEqual(brief(step), [['sam', 'me', 'stepparent', 'parentsPartner']]);
assert.equal(
  run(
    [me, who('joan', 'mother'), who('dad', 'father')],
    [couple(['joan', 'dad'], 'married')],
  ).length,
  0,
  'a parent married to a parent is no stepparent',
);
assert.equal(
  run(
    [me, who('joan', 'mother'), who('sam')],
    [couple(['joan', 'sam'], 'dating')],
  ).length,
  0,
  'a dating partner is no stepparent',
);

// Friends and work never imply anything.
assert.equal(
  run(
    [me, who('joan', 'mother'), who('pat'), who('eli', 'brother')],
    [
      link(['joan', 'pat'], 'friend', 'friend', 'friend'),
      link(['eli', 'pat'], 'work', 'coworker', 'coworker'),
    ],
  ).length,
  0,
  'friends and work imply nothing',
);

// A stored link, a couple or a refusal beats an inference.
const trio = [me, who('maya', 'sister'), who('eli', 'brother')];
assert.equal(
  run(trio, [link(['eli', 'maya'], 'family', 'brother', 'sister')]).length,
  0,
);
assert.equal(
  run(trio, [
    link(['eli', 'maya'], 'family', null, null, { source: 'refused' }),
  ]).length,
  0,
  'a refusal is never worked out again',
);
assert.equal(
  run(trio, [
    link(['eli', 'maya'], 'family', null, null, { isUnreadable: true }),
  ]).length,
  0,
  'a document that would not open still counts',
);
assert.equal(
  run(trio, [couple(['eli', 'maya'], null)]).length,
  0,
  'a couple pair is never worked out as family',
);
assert.equal(
  run(trio, [link(['eli', 'maya'], 'friend', 'friend', 'friend')]).length,
  1,
  'a friend link does not stop a family one',
);

// The owner and someone who already has a family word is never worked out.
assert.equal(
  run(
    [me, who('joan', 'mother'), who('ada', 'grandmother')],
    [link(['ada', 'joan'], 'family', 'mother', 'daughter')],
  ).length,
  0,
);

// Private people, pets and organizations are left out, as their facts are.
const withPrivate = (id: string) =>
  [me, who('maya', 'sister'), who('eli', 'brother')].map((entry) =>
    entry.id === id ? { ...entry, isPrivate: true } : entry,
  );
assert.equal(run(withPrivate('eli')).length, 0);
assert.equal(
  run([me, who('maya', 'sister'), who('eli', 'brother', { isPerson: false })])
    .length,
  0,
);
assert.equal(
  run(
    [me, who('joan', 'mother', { isPrivate: true }), who('ruth')],
    [link(['joan', 'ruth'], 'family', 'sister', 'sister')],
  ).length,
  0,
  'nothing is worked out through a private person',
);

// One result per pair, no one with themself, no owner, nothing when no one is the owner.
const crowded = run(
  [me, who('joan', 'mother'), who('eli', 'brother')],
  [link(['eli', 'joan'], 'family', 'son', 'mother')],
);
assert.equal(
  new Set(crowded.map((entry) => [entry.firstId, entry.secondId].sort().join()))
    .size,
  crowded.length,
);
assert.equal(
  crowded.every((entry) => entry.firstId !== entry.secondId),
  true,
);
assert.equal(
  run([who('maya', 'sister'), who('eli', 'brother')], [], null).length,
  0,
  'without an owner a family word means nothing',
);

// The server's copy works out the same.
assert.deepEqual(
  server.inferFamilyLinks({
    selfId: 'me',
    people: family,
    connections: familyLinks,
  }),
  worked,
);

// 200 people and 400 connections in well under 50 ms.
const crowd = Array.from({ length: 200 }, (_, index) =>
  who(
    `p${index}`,
    index < 6
      ? (['mother', 'father', 'sister', 'brother', 'aunt', 'uncle'] as const)[
          index
        ]
      : null,
  ),
);
const web = Array.from({ length: 400 }, (_, index): InferConnectionState => {
  const first = `p${(index * 7) % 200}`;
  const second = `p${(index * 13 + 5) % 200}`;
  return link(
    first < second ? [first, second] : [second, first],
    index % 3 === 0 ? 'friend' : index % 3 === 1 ? 'family' : 'couple',
    index % 3 === 1 ? 'sister' : 'friend',
    index % 3 === 1 ? 'sister' : 'friend',
    { status: index % 3 === 2 ? 'married' : null },
  );
}).filter((entry) => entry.whoIds[0] !== entry.whoIds[1]);
const everyone = [who('me'), ...crowd];
inferFamilyLinks({ selfId: 'me', people: everyone, connections: web });
const started = performance.now();
const large = inferFamilyLinks({
  selfId: 'me',
  people: everyone,
  connections: web,
});
const took = performance.now() - started;
assert.ok(took < 50, `inference took ${took.toFixed(1)} ms for 200 people`);
assert.ok(large.length >= 0);

console.log('Helm family links: all checks passed');

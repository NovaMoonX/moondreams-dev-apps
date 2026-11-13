import assert from 'node:assert/strict';

import {
  findRule,
  findNextHomes,
  RULE_VARIES,
} from '../../src/apps/runway/engine/rules.ts';
import type { OpenRule } from '../../src/apps/runway/types.ts';

let made = 0;
const rule = (fields: Partial<OpenRule>): OpenRule => {
  made += 1;
  return {
    id: `r${made}`,
    createdAt: made,
    updatedAt: made,
    merchantKey: null,
    merchantName: null,
    category: null,
    cardId: null,
    target: 'everyday',
    ...fields,
  };
};

const live = new Set(['everyday', 'groceries', 'dining']);
const safeway = rule({
  merchantKey: 'safeway',
  merchantName: 'Safeway',
  target: 'groceries',
});
const discover = rule({ cardId: 'discover' });
const restaurantsOnDiscover = rule({
  category: 'FOOD_AND_DRINK_RESTAURANT',
  cardId: 'discover',
  target: 'dining',
});
const restaurants = rule({
  category: 'FOOD_AND_DRINK_RESTAURANT',
  target: 'dining',
});
const rules = [safeway, discover, restaurantsOnDiscover, restaurants];

const homes = (
  removing: OpenRule[],
  all: OpenRule[],
  envelopes: ReadonlySet<string> = live,
) =>
  findNextHomes(removing, all, envelopes).map(({ removed, cardId, by }) => [
    removed.id,
    cardId,
    by?.id ?? null,
  ]);

assert.deepEqual(
  homes([safeway], rules),
  [
    [safeway.id, 'discover', discover.id],
    [safeway.id, null, null],
  ],
  'removing Safeway hands Safeway on Discover to the Discover rule; other cards wait',
);
assert.equal(
  findRule({ merchant: 'Safeway', category: null, cardId: 'discover' }, [
    discover,
    restaurantsOnDiscover,
    restaurants,
  ])?.rule.id,
  discover.id,
  'the engine agrees once Safeway is gone',
);

assert.deepEqual(
  homes([discover], rules),
  [[discover.id, 'discover', null]],
  'a card rule has nothing broader under it',
);

assert.deepEqual(
  homes([restaurantsOnDiscover], rules),
  [[restaurantsOnDiscover.id, 'discover', restaurants.id]],
  'a kind of place on a card falls to the same kind of place on any card',
);

assert.deepEqual(
  homes([safeway], rules, new Set(['groceries', 'dining'])),
  [
    [safeway.id, 'discover', null],
    [safeway.id, null, null],
  ],
  'a broader rule that is paused itself takes nothing',
);

const askDiscover = rule({ cardId: 'discover', target: RULE_VARIES });
assert.deepEqual(
  homes([safeway], [safeway, askDiscover]),
  [
    [safeway.id, 'discover', null],
    [safeway.id, null, null],
  ],
  'a rule that asks places nothing, so it is not named',
);

assert.deepEqual(
  homes([safeway, discover], rules),
  [
    [safeway.id, 'discover', null],
    [safeway.id, null, null],
    [discover.id, 'discover', null],
  ],
  'two rules removed together never name each other',
);

const amazon = rule({ merchantKey: 'amazon', merchantName: 'Amazon' });
const shopping = rule({ category: 'GENERAL_MERCHANDISE' });
assert.deepEqual(
  homes([amazon], [amazon, shopping]),
  [[amazon.id, null, null]],
  'a kind-of-place rule never takes a store that sells everything',
);

const askOnDiscover = rule({ cardId: 'discover', target: RULE_VARIES });
const laterDiscover = rule({ cardId: 'discover' });
assert.deepEqual(
  homes([safeway], [safeway, askOnDiscover, laterDiscover]),
  [
    [safeway.id, 'discover', null],
    [safeway.id, null, null],
  ],
  'an ask rule that ranks next wins, so the live rule under it is not named',
);
const pausedDiscover = rule({ cardId: 'discover', target: 'ended' });
const latestDiscover = rule({ cardId: 'discover' });
assert.deepEqual(
  homes([safeway], [safeway, pausedDiscover, latestDiscover]),
  [
    [safeway.id, 'discover', null],
    [safeway.id, null, null],
  ],
  'a paused rule that ranks next holds the purchases, so nothing takes over',
);

const costcoAsk = rule({
  merchantKey: 'costco wholesale',
  merchantName: 'Costco Wholesale',
  target: RULE_VARIES,
});
const visaAll = rule({ cardId: 'visa' });
assert.deepEqual(
  homes([costcoAsk], [costcoAsk, visaAll]),
  [
    [costcoAsk.id, 'visa', visaAll.id],
    [costcoAsk.id, null, null],
  ],
  'an ask rule being removed no longer makes its store broad',
);

const costco = rule({ merchantKey: 'costco', merchantName: 'Costco' });
const visa = rule({ cardId: 'visa', target: 'groceries' });
const amex = rule({ cardId: 'amex', target: 'dining' });
assert.deepEqual(
  homes([costco], [costco, visa, amex]),
  [
    [costco.id, 'visa', visa.id],
    [costco.id, 'amex', amex.id],
    [costco.id, null, null],
  ],
  'each card with its own rule is read on its own',
);

const askOnVisa = rule({ cardId: 'visa', target: RULE_VARIES });
const anyRestaurants = rule({
  category: 'FOOD_AND_DRINK_RESTAURANT',
  target: 'dining',
});
const restaurantsLater = rule({
  category: 'FOOD_AND_DRINK_RESTAURANT',
  target: 'everyday',
});
assert.deepEqual(
  homes([restaurantsLater], [anyRestaurants, restaurantsLater, askOnVisa]),
  [],
  'a rule an earlier one outranks everywhere wins nothing, so nothing moves',
);
assert.deepEqual(
  homes([anyRestaurants], [anyRestaurants, restaurantsLater, askOnVisa]),
  [
    [anyRestaurants.id, 'visa', restaurantsLater.id],
    [anyRestaurants.id, null, restaurantsLater.id],
  ],
  'a kind of place falls to the next rule for it, before a card rule',
);

const clay = rule({
  merchantKey: 'clay studio',
  merchantName: 'Clay Studio',
  target: 'ended',
});
assert.deepEqual(
  homes([clay], [clay, discover]),
  [
    [clay.id, 'discover', discover.id],
    [clay.id, null, null],
  ],
  'a paused rule holds its purchases today, so removing it hands them on',
);

const groceriesKind = rule({ category: 'FOOD_AND_DRINK_GROCERIES' });
const [safewayNext] = findNextHomes([safeway], [safeway, groceriesKind], live);
assert.deepEqual(
  [safewayNext?.by, safewayNext?.byKind.map(({ id }) => id)],
  [null, [groceriesKind.id]],
  'a place left to wait still names the kind-of-place rule that would catch its purchases first',
);
assert.deepEqual(
  findNextHomes([amazon], [amazon, shopping], live)[0]?.byKind,
  [],
  'a store that sells everything is never caught by a kind-of-place rule',
);

const safewayOnVisa = rule({
  merchantKey: 'safeway',
  merchantName: 'Safeway',
  cardId: 'visa',
  target: 'dining',
});
assert.deepEqual(
  findNextHomes([safeway], [safeway, safewayOnVisa, groceriesKind], live)
    .filter(({ cardId }) => cardId === 'visa')
    .map(({ byKind }) => byKind),
  [[]],
  'a store rule left on a card outranks every kind-of-place rule there',
);
const groceriesAsk = rule({
  category: 'FOOD_AND_DRINK_GROCERIES',
  target: RULE_VARIES,
});
assert.deepEqual(
  findNextHomes([safeway], [safeway, groceriesAsk], live)[0]?.byKind.map(
    ({ id }) => id,
  ),
  [groceriesAsk.id],
  'a kind-of-place rule that asks still wins those purchases, so it is named',
);
const groceriesOnVisa = rule({
  category: 'FOOD_AND_DRINK_GROCERIES',
  cardId: 'visa',
  target: 'dining',
});
assert.deepEqual(
  findNextHomes([safeway], [safeway, groceriesKind, groceriesOnVisa], live).map(
    ({ cardId, byKind }) => [cardId, byKind.map(({ id }) => id)],
  ),
  [
    ['visa', [groceriesOnVisa.id]],
    [null, [groceriesKind.id]],
  ],
  'on a card with its own kind-of-place rule, that one wins; other cards keep the general one',
);

console.log('runwayRuleTakeover: all checks passed');

import assert from 'node:assert/strict';

import {
  findRule,
  findTakeovers,
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

const [overSafeway] = findTakeovers([safeway], rules, live);
assert.equal(
  overSafeway?.by.id,
  discover.id,
  'removing Safeway hands Safeway on Discover to the Discover rule',
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
  findTakeovers([discover], rules, live),
  [],
  'a card rule has nothing broader under it, and Safeway ranks above it',
);

assert.equal(
  findTakeovers([restaurantsOnDiscover], rules, live)[0]?.by.id,
  restaurants.id,
  'a kind of place on a card falls to the same kind of place on any card',
);

assert.deepEqual(
  findTakeovers([safeway], rules, new Set(['groceries', 'dining'])),
  [],
  'a broader rule that is paused itself takes nothing',
);

const askDiscover = rule({ cardId: 'discover', target: RULE_VARIES });
assert.deepEqual(
  findTakeovers([safeway], [safeway, askDiscover], live),
  [],
  'a rule that asks places nothing, so it is not named',
);

assert.deepEqual(
  findTakeovers([safeway, discover], rules, live),
  [],
  'two rules removed together never name each other',
);

const amazon = rule({ merchantKey: 'amazon', merchantName: 'Amazon' });
const shopping = rule({ category: 'GENERAL_MERCHANDISE' });
assert.deepEqual(
  findTakeovers([amazon], [amazon, shopping], live),
  [],
  'a kind-of-place rule never takes a store that sells everything',
);

const askOnDiscover = rule({ cardId: 'discover', target: RULE_VARIES });
const laterDiscover = rule({ cardId: 'discover' });
assert.deepEqual(
  findTakeovers([safeway], [safeway, askOnDiscover, laterDiscover], live),
  [],
  'an ask rule that ranks next wins, so the live rule under it is not named',
);
const pausedDiscover = rule({ cardId: 'discover', target: 'ended' });
const latestDiscover = rule({ cardId: 'discover' });
assert.deepEqual(
  findTakeovers([safeway], [safeway, pausedDiscover, latestDiscover], live),
  [],
  'a paused rule that ranks next holds the purchases, so nothing takes over',
);

const costcoAsk = rule({
  merchantKey: 'costco wholesale',
  merchantName: 'Costco Wholesale',
  target: RULE_VARIES,
});
const anyGroceries = rule({ category: null, cardId: 'visa' });
assert.equal(
  findTakeovers([costcoAsk], [costcoAsk, anyGroceries], live)[0]?.by.id,
  anyGroceries.id,
  'an ask rule being removed no longer makes its store broad',
);

console.log('runwayRuleTakeover: all checks passed');

import assert from 'node:assert/strict';

import { matchExistingCat } from '../../src/apps/nine-lives/utils/matchExistingCat.ts';
import { matchExistingClinic } from '../../src/apps/nine-lives/utils/matchExistingClinic.ts';
import { normalizeCustomLabelCasing } from '../../src/apps/nine-lives/utils/normalizeCustomLabelCasing.ts';
import {
  createOptionMatcher,
  toComparable,
  toDisplayCase,
} from '../../src/utils/optionMatchUtils.ts';

const named = (...names: string[]) =>
  names.map((name, index) => ({ id: `id${index}`, name }));
const byName = createOptionMatcher<{ id: string; name: string }>({
  names: (option) => [option.name],
});
const idOf = (value: string, options: ReturnType<typeof named>) =>
  byName.match(value, options)?.id ?? null;

assert.equal(
  toComparable('  Crème   Brûlée! '),
  'creme brulee',
  'accents, case, punctuation and spacing are off',
);
assert.equal(
  toComparable('Lucas'),
  'lucas',
  'plurals are not folded unless asked',
);
assert.equal(toComparable('Lucas', true), 'luca', 'plurals fold when asked');
assert.equal(
  toComparable('日本 ねこ'),
  '日本 ねこ',
  'letters of any script are kept',
);

assert.equal(toDisplayCase('chicken THIGH'), 'Chicken thigh');
assert.equal(toDisplayCase('maine   coon', { style: 'title' }), 'Maine Coon');
assert.equal(toDisplayCase('bbq SAUCE'), 'Bbq sauce');
assert.equal(
  toDisplayCase('BBQ sauce', { keepAcronyms: true }),
  'BBQ sauce',
  'a short all-capitals word is kept on request',
);
assert.equal(toDisplayCase('   '), '');

const list = named(
  'Chicken thigh',
  'Tomato paste',
  'Tomato pasta',
  'Valley Veterinary Clinic',
  'Sweet potato',
  'Whiskers',
);
assert.equal(
  idOf('chicken thigh', list),
  'id0',
  'the same name in another case',
);
assert.equal(
  idOf('thigh chicken', list),
  'id0',
  'the same words in another order',
);
assert.equal(
  idOf('Valley Veterinry Clinic', list),
  'id3',
  'one wrong letter in a long name',
);
assert.equal(
  idOf('Whiskrs', list),
  'id5',
  'a missing letter in an eight-letter name',
);
assert.equal(
  idOf('tomato pastx', list),
  null,
  'two options equally close is not clearly one, so neither',
);
assert.equal(
  idOf('cumin', named('cumik')),
  null,
  'a five-letter name with one wrong letter is not close enough',
);
assert.equal(idOf('', list), null);
assert.equal(idOf('???', list), null);
assert.equal(
  idOf('tomato', list),
  null,
  'a word that is only part of a name is another thing',
);

const twice = named('Cat food', 'Cat food');
assert.equal(
  idOf('cat food', twice),
  'id0',
  'the earlier option wins an exact tie',
);

const foods = createOptionMatcher<{
  id: string;
  name: string;
  aliases: string[];
}>({
  names: (food) => [food.name, ...food.aliases],
  ignoreWords: new Set(['fresh', 'large']),
  prepare: (text) => text.replace(/\bbone[\s-]?in\b/gi, ' '),
  foldPlurals: true,
});
const food = { id: 'f1', name: 'Chicken thigh', aliases: ['drumstick meat'] };
assert.equal(
  foods.match('large fresh bone-in chicken thighs', [food])?.id,
  'f1',
  'ignored and prepared words drop, plurals fold',
);
assert.equal(
  foods.match('Drumstick Meats', [food])?.id,
  'f1',
  'an alias matches like the label',
);
assert.equal(foods.comparable('Fresh Bone-in Chicken Thighs'), 'chicken thigh');

const strict = createOptionMatcher<string>({ reorder: false, typos: false });
assert.equal(
  strict.match('delta air lines', ['Delta Air Lines']),
  'Delta Air Lines',
  'an exact-only list still ignores case',
);
assert.equal(
  strict.match('Delta Air Line', ['Delta Air Lines']),
  null,
  'an exact-only list never takes a near miss',
);
assert.equal(
  strict.match('Lines Air Delta', ['Delta Air Lines']),
  null,
  'an unordered list is not reordered',
);

const breeds = createOptionMatcher<string>({
  typos: 'loose',
  casing: { style: 'title' },
});
const maineCoon = breeds.resolve('maine COON', ['Maine Coon', 'Siamese']);
assert.deepEqual(
  maineCoon,
  { kind: 'match', option: 'Maine Coon' },
  "a match answers with the list's own spelling",
);
assert.deepEqual(breeds.resolve('siamse', ['Maine Coon', 'Siamese']), {
  kind: 'match',
  option: 'Siamese',
});
assert.deepEqual(
  breeds.resolve('maine coone', ['Maine Coon', 'Siamese']),
  { kind: 'match', option: 'Maine Coon' },
  'a list whose matches are reviewed accepts a small typo in a short word',
);
assert.deepEqual(
  breeds.resolve('turkish van', ['Maine Coon', 'Siamese']),
  { kind: 'custom', label: 'Turkish Van' },
  'nothing close is a custom option, cased like the list',
);

const looksAlike = createOptionMatcher<string>();
const milks = [
  'Oat milk',
  '2% milk',
  'Beef stock',
  'Lemon juice',
  'Biscuit',
  'Chicken thigh',
  'Chicken stock',
];
assert.equal(
  looksAlike.match('goat milk', milks),
  null,
  'a word under six letters is never a typo',
);
assert.equal(
  looksAlike.match('1% milk', milks),
  null,
  'a number is not a typo',
);
assert.equal(looksAlike.match('beef stick', milks), null, 'stick is not stock');
assert.equal(
  looksAlike.match('lemon juiced', milks),
  null,
  'a final d or s is another word',
);
assert.equal(
  looksAlike.match('Biscuits', milks),
  null,
  'a final s is another word',
);
assert.equal(
  looksAlike.match('chiken thigh', milks),
  'Chicken thigh',
  'a typo in one long word still matches',
);
assert.equal(
  looksAlike.match('chicken thihg', milks),
  null,
  'a typo must keep the same first letter and one differing word',
);
assert.equal(
  looksAlike.match('thigh chicken', milks),
  'Chicken thigh',
  'the same words in another order',
);
assert.equal(
  looksAlike.match('thigh chiken', milks),
  null,
  'a reorder and a typo together are not combined',
);

const spices = createOptionMatcher<{
  id: string;
  name: string;
  isCustom: boolean;
}>({
  names: (spice) => [spice.name],
  ignoreWords: new Set(['ground', 'fresh']),
  prefer: (spice) => spice.isCustom,
});
const spice = (id: string, name: string, isCustom = false) => ({
  id,
  name,
  isCustom,
});
assert.equal(
  spices.match('fresh ginger', [
    spice('g', 'Ground ginger'),
    spice('f', 'Fresh ginger'),
  ])?.id,
  'f',
  'an exact name wins over one that matches only once ignored words drop',
);
assert.equal(
  spices.match('ginger', [
    spice('g', 'Ground ginger'),
    spice('f', 'Fresh ginger'),
  ]),
  null,
  'two options equally close after ignored words drop is not clearly one',
);
assert.equal(
  spices.match('ginger', [
    spice('g', 'Ground ginger'),
    spice('mine', 'Fresh ginger', true),
  ])?.id,
  'mine',
  'one preferred option among equals is the pick',
);
assert.equal(
  spices.match('ground cinnamon', [spice('c', 'Cinnamon')])?.id,
  'c',
  'an ignored word drops when only one option is left',
);

const cats = named(
  'Luna',
  'Luca',
  'Lucas',
  'Mia',
  'Mila',
  'Mr. Whiskers',
  'Jane Mary',
  'Oliver',
);
const catId = (name: string) => matchExistingCat(name, cats as never);
assert.equal(catId('LUNA'), 'id0');
assert.equal(catId('Lucas'), 'id2', 'Lucas is Lucas and not Luca');
assert.equal(catId('Mia'), 'id3', 'Mia is not Mila');
assert.equal(catId('Mary Jane'), null, 'a name is not reordered');
assert.equal(catId('Mr Whiskers'), 'id5', 'punctuation does not matter');
assert.equal(catId(null), null);
assert.equal(
  catId('Olivers'),
  'id7',
  'a reviewed list takes a small misspelling',
);

const clinics = named('Banfield Pet Hospital', 'Valley Veterinary Clinic');
assert.equal(
  matchExistingClinic('Pet Hospital Banfield', clinics as never),
  'id0',
);
assert.equal(
  matchExistingClinic('Banfeld Pet Hospital', clinics as never),
  'id0',
);
assert.equal(
  matchExistingClinic('Sunrise Animal Care', clinics as never),
  null,
);

assert.equal(normalizeCustomLabelCasing('  flea   & TICK '), 'Flea & tick');
assert.equal(normalizeCustomLabelCasing(''), '');

console.log('optionMatch: all checks passed');

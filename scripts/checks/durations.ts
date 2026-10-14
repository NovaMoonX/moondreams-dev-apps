import assert from 'node:assert/strict';

import {
  findDurations,
  formatClock,
  formatDuration,
} from '../../src/utils/durationUtils.ts';

const seconds = (text: string) =>
  findDurations(text).map((found) => found.seconds);

// One length of time, in each way a step writes it
assert.deepEqual(seconds('Simmer for 25 minutes.'), [1500]);
assert.deepEqual(seconds('Bake 25 min'), [1500]);
assert.deepEqual(seconds('Bake 25min.'), [1500]);
assert.deepEqual(seconds('Rest for 1 minute'), [60]);
assert.deepEqual(seconds('Let it sit for 1 hour.'), [3600]);
assert.deepEqual(seconds('Roast 2 hrs'), [7200]);
assert.deepEqual(seconds('Whisk for 30 seconds'), [30]);
assert.deepEqual(seconds('Toast 45 secs'), [45]);
assert.deepEqual(seconds('Simmer for 25 MINUTES'), [1500]);
assert.deepEqual(seconds('Let it rest for a 10-minute stretch'), [600]);

// A length written in two parts is one length
assert.deepEqual(seconds('Braise for 1 hr 30 min'), [5400]);
assert.deepEqual(seconds('Braise for 1 hour and 15 minutes'), [4500]);
assert.deepEqual(seconds('Braise 2 hours, 30 minutes'), [9000]);
assert.deepEqual(seconds('Chill 1 minute 30 seconds'), [90]);
assert.deepEqual(seconds('Cook 1 hour. Rest 15 minutes.'), [3600, 900]);

// A range gives its longer end
assert.deepEqual(seconds('Cook 10-15 min'), [900]);
assert.deepEqual(seconds('Cook 10–15 minutes'), [900]);
assert.deepEqual(seconds('Cook 2 to 3 minutes'), [180]);
assert.deepEqual(seconds('Cook 1 or 2 minutes'), [120]);
assert.deepEqual(seconds('Bake 1 to 1½ hours'), [5400]);

// Fractions and decimals
assert.deepEqual(seconds('Rest 1.5 hours'), [5400]);
assert.deepEqual(seconds('Rest 1/2 hour'), [1800]);
assert.deepEqual(seconds('Rest 1 1/2 hours'), [5400]);
assert.deepEqual(seconds('Rest 1½ hours'), [5400]);
assert.deepEqual(seconds('Rest ½ hour'), [1800]);
assert.deepEqual(seconds('Bake for half an hour'), [1800]);
assert.deepEqual(seconds('Simmer about an hour'), [3600]);

// Several in a step, in order, without repeats
assert.deepEqual(
  seconds('Sear 3 minutes per side, then rest 10 minutes'),
  [180, 600],
);
assert.deepEqual(seconds('Cook 5 minutes, stir, cook 5 minutes more'), [300]);
assert.deepEqual(
  findDurations('Preheat to 350°F, then bake 25 minutes').map((f) => f.text),
  ['25 minutes'],
);

// Not a length of time
assert.deepEqual(seconds('Add 2 tablespoons of oil'), []);
assert.deepEqual(seconds('Add 4 minced garlic cloves'), []);
assert.deepEqual(seconds('Add 1/2 cup of milk'), []);
assert.deepEqual(seconds('Bake at 350 degrees'), []);
assert.deepEqual(seconds('Stir until golden'), []);
assert.deepEqual(seconds('Season with 2 pinches of salt'), []);
assert.deepEqual(seconds('Cook for 0 minutes'), []);
assert.deepEqual(seconds('Marinate for 48 hours'), []);
assert.deepEqual(seconds('Slice it into 3 minute pieces'), [180]);
assert.deepEqual(seconds(''), []);

// Labels and countdowns
assert.equal(formatDuration(1500), '25 min');
assert.equal(formatDuration(5400), '1 h 30 min');
assert.equal(formatDuration(3600), '1 h');
assert.equal(formatDuration(30), '30 sec');
assert.equal(formatDuration(90), '1 min 30 sec');
assert.equal(formatClock(25 * 60 * 1000), '25:00');
assert.equal(formatClock(4_200), '0:05');
assert.equal(formatClock(1), '0:01');
assert.equal(formatClock(0), '0:00');
assert.equal(formatClock(-500), '0:00');
assert.equal(formatClock(5_400_000), '1:30:00');
assert.equal(formatClock(59_999), '1:00');

// A hostile step reads in linear time
const hostile = `${'1 '.repeat(20_000)}${'9'.repeat(20_000)} minutes`;
const started = performance.now();
findDurations(hostile);
assert.ok(performance.now() - started < 1000, 'findDurations is slow');

console.log('duration checks passed');

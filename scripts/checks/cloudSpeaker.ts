import assert from 'node:assert/strict';

import {
  readFallbacks,
  resetFallbacks,
} from '../../src/lib/fallbacks/fallbacks.ts';
import {
  createCloudSpeaker,
  getDeviceLineWaitMs,
} from '../../src/lib/speech/voice/cloudSpeaker.ts';
import {
  FIRST_BYTE_MS,
  RESUME_MS,
} from '../../src/lib/speech/voice/cloudTts.ts';
import type { SpeechFetch } from '../../src/lib/speech/voice/speechSource.ts';

const LATCH_KEY = 'speech:cloud-speaker-latch';
const fakeClock = { offset: 0 };
const realNow = Date.now.bind(Date);
Date.now = () => realNow() + fakeClock.offset;

const calls = { fetches: 0 };
const modes = { current: 'fail' as 'fail' | 'hang' };
const fetchSpeech = (): Promise<SpeechFetch> => {
  calls.fetches += 1;
  return modes.current === 'fail'
    ? Promise.resolve({ status: 'unavailable', detail: 'HTTP 500' })
    : new Promise<never>(() => undefined);
};

const speaker = createCloudSpeaker({
  source: { fetchSpeech },
  lang: 'en-US',
  isNatural: () => false,
  getPriority: () => 'reply',
  onSpoken: () => undefined,
  onCut: () => undefined,
});

/** Says one line and returns how long it took to end and how many times the cloud was asked. */
const sayLine = async () => {
  const before = calls.fetches;
  const startedAt = realNow();
  await new Promise<void>((resolve) =>
    speaker.speak('Hello', {
      onStart: () => undefined,
      onNoStart: () => undefined,
      onEnd: resolve,
    }),
  );
  return { ms: realNow() - startedAt, fetches: calls.fetches - before };
};

const firstLineWait = speaker.getLineWaitMs();
assert.ok(
  firstLineWait >= 6000 + RESUME_MS + getDeviceLineWaitMs(false) - 500,
  'a cold session waits out the first line allowance, the audio wake and the device start',
);
assert.ok(
  firstLineWait > FIRST_BYTE_MS + RESUME_MS,
  'the queue wait is longer than the cloud voice can take before sound',
);

// One fallback: the next line waits only a short first byte.
resetFallbacks();
const first = await sayLine();
assert.equal(first.fetches, 1, 'the first line asks the cloud');
assert.ok(
  speaker.getLineWaitMs() < firstLineWait,
  'after one fallback the worst wait drops',
);
modes.current = 'hang';
const waitBeforeSlow = speaker.getLineWaitMs();
const slow = await sayLine();
assert.ok(
  slow.ms < 3000,
  `a slow line after a fallback gives up in ${slow.ms} ms`,
);
assert.ok(slow.ms >= 1400, 'but still waits for the short first byte');
assert.ok(
  waitBeforeSlow >= 1500 + RESUME_MS + getDeviceLineWaitMs(false) &&
    waitBeforeSlow > slow.ms,
  'the queue wait covers the longest the line could take before sound',
);

// Two in a row: the device's voice goes first for the rest of the session.
assert.equal(
  readFallbacks().find((entry) => entry.key === LATCH_KEY)?.recoveredAt,
  null,
  'the latch is reported',
);
const latched = await sayLine();
assert.equal(latched.fetches, 0, 'a latched session never asks the cloud');
assert.ok(
  speaker.getLineWaitMs() === getDeviceLineWaitMs(false),
  'a latched session waits only for the device',
);

// The cloud voice is tried again after a while, and a failure latches it again.
fakeClock.offset += 6 * 60_000;
modes.current = 'fail';
const retried = await sayLine();
assert.equal(retried.fetches, 1, 'after five minutes the cloud is tried again');
const relatched = await sayLine();
assert.equal(relatched.fetches, 0, 'a failed retry latches again');

// A reset starts over: cloud first, a cold start's allowance, no report.
speaker.reset();
assert.equal(
  readFallbacks().find((entry) => entry.key === LATCH_KEY)?.recoveredAt ===
    null,
  false,
  'reset marks the report recovered',
);
assert.equal(
  speaker.getLineWaitMs(),
  firstLineWait,
  'reset brings back the first line allowance',
);
const afterReset = await sayLine();
assert.equal(afterReset.fetches, 1, 'after a reset the cloud goes first');

Date.now = realNow;
console.log('Cloud speaker: ok');

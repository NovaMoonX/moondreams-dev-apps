import assert from 'node:assert/strict';

import {
  createSpeechListener,
  type SpeechCommandsError,
  type SpeechCommandsStatus,
} from '../../src/hooks/useSpeechCommands.ts';

interface Task {
  id: number;
  at: number;
  run: () => void;
}

const clock = { now: 0, nextId: 1, tasks: [] as Task[] };
const setTimeoutFake = (run: () => void, ms = 0) => {
  const id = clock.nextId;
  clock.nextId += 1;
  clock.tasks = [...clock.tasks, { id, at: clock.now + ms, run }];
  return id;
};
const clearTimeoutFake = (id: number) => {
  clock.tasks = clock.tasks.filter((task) => task.id !== id);
};
const advance = (ms: number) => {
  const end = clock.now + ms;
  const runNext = (): void => {
    const due = clock.tasks
      .filter((task) => task.at <= end)
      .sort((a, b) => a.at - b.at || a.id - b.id)[0];
    if (!due) {
      clock.now = end;
      return;
    }
    clock.tasks = clock.tasks.filter((task) => task !== due);
    clock.now = due.at;
    due.run();
    runNext();
  };
  runNext();
};

const env = {
  log: [] as string[],
  startError: null as string | null,
  speech: 'normal' as 'normal' | 'silent' | 'never-ends',
  current: null as FakeRecognition | null,
};
const record = (entry: string) => {
  env.log = [...env.log, `${clock.now}:${entry}`];
};

class FakeRecognition {
  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onresult: ((event: unknown) => void) | null = null;
  isRunning = false;
  results: unknown[] = [];

  constructor() {
    record('new');
  }

  start() {
    if (this.isRunning) {
      record('start-throws');
      throw new Error('InvalidStateError');
    }
    this.isRunning = true;
    this.results = [];
    env.current = this;
    record('start');
    const error = env.startError;
    setTimeoutFake(() => {
      if (!this.isRunning) return;
      if (error !== null) {
        this.onerror?.({ error });
        this.end();
        return;
      }
      record('onstart');
      this.onstart?.();
    }, 20);
  }

  abort() {
    record('abort');
    setTimeoutFake(() => {
      if (!this.isRunning) return;
      this.onerror?.({ error: 'aborted' });
      this.end();
    }, 10);
  }

  end() {
    if (!this.isRunning) return;
    this.isRunning = false;
    record('end');
    this.onend?.();
  }
}

const hear = (...alternatives: string[]) => {
  const recognition = env.current;
  if (recognition === null || !recognition.isRunning) return false;
  const result = Object.assign(
    alternatives.map((transcript) => ({ transcript, confidence: 0.9 })),
    { isFinal: true },
  );
  recognition.results = [...recognition.results, result];
  recognition.onresult?.({
    resultIndex: recognition.results.length - 1,
    results: recognition.results,
  });
  return true;
};

interface FakeUtterance {
  text: string;
  volume: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

const synth = {
  current: null as FakeUtterance | null,
  getVoices: () => [],
  speak(utterance: FakeUtterance) {
    record(
      `speak:${utterance.text.trim() === '' ? '(silent)' : utterance.text}`,
    );
    this.current = utterance;
    if (env.speech === 'silent') return;
    setTimeoutFake(() => utterance.onstart?.(), 10);
    if (env.speech === 'never-ends') return;
    setTimeoutFake(() => {
      if (this.current !== utterance) return;
      this.current = null;
      record('spoken');
      utterance.onend?.();
    }, 300);
  },
  cancel() {
    const utterance = this.current;
    this.current = null;
    if (utterance !== null) record('speech-cancel');
    utterance?.onerror?.();
  },
};

Object.assign(globalThis, {
  window: {
    isSecureContext: true,
    setTimeout: setTimeoutFake,
    clearTimeout: clearTimeoutFake,
    webkitSpeechRecognition: FakeRecognition,
    speechSynthesis: synth,
  },
  document: { visibilityState: 'visible' },
  SpeechSynthesisUtterance: class {
    text: string;
    lang = '';
    voice = null;
    volume = 1;
    onstart = null;
    onend = null;
    onerror = null;
    constructor(text: string) {
      this.text = text;
    }
  },
});
Date.now = () => clock.now;

const IDLE_MS = 900_000;

const setUp = (used: (alternatives: string[]) => boolean = () => true) => {
  clock.now = 0;
  clock.tasks = [];
  env.log = [];
  env.startError = null;
  env.speech = 'normal';
  env.current = null;
  const seen = {
    status: 'off' as SpeechCommandsStatus,
    error: null as SpeechCommandsError | null,
    heard: [] as string[][],
    halts: [] as SpeechCommandsError[],
  };
  const listener = createSpeechListener(
    (status) => {
      seen.status = status;
    },
    (error) => {
      seen.error = error;
    },
  );
  listener.setOptions({
    lang: 'en-US',
    speechLang: 'en-US',
    idleStopMs: IDLE_MS,
    onHalt: (error) => {
      seen.halts = [...seen.halts, error];
    },
    onFinalTranscript: (alternatives) => {
      seen.heard = [...seen.heard, alternatives];
      return used(alternatives);
    },
  });
  return { listener, seen };
};
const entries = (name: string) =>
  env.log
    .filter((entry) => entry.endsWith(`:${name}`))
    .map((entry) => Number(entry.split(':')[0]));

{
  const { listener, seen } = setUp();
  listener.start();
  assert.equal(
    seen.status,
    'starting',
    'a start from a tap says it is starting',
  );
  advance(20);
  assert.deepEqual(
    [seen.status, env.log],
    ['listening', ['0:speak:(silent)', '0:new', '0:start', '20:onstart']],
    'the tap readies the voice with a silent reading, makes one recognizer and listens once it starts',
  );
  advance(5000);
  env.current?.end();
  advance(249);
  assert.deepEqual(
    entries('start'),
    [0],
    'a session that ran its course is not restarted at once',
  );
  advance(1);
  assert.deepEqual(
    entries('start'),
    [0, 5270],
    'a session that ran its course restarts 250 ms after it ends',
  );
}

{
  const { listener, seen } = setUp();
  env.startError = 'network';
  listener.start();
  advance(20_000);
  const starts = entries('start');
  assert.deepEqual(
    starts.slice(1).map((at, index) => at - starts[index] - 20),
    [500, 1000, 2000, 4000],
    'quick failures back off 500 ms, 1, 2 and 4 s between tries',
  );
  assert.deepEqual(
    [starts.length, seen.status, seen.error],
    [5, 'off', 'unavailable'],
    'the fifth quick failure stops it with a reason, and it never tries again on its own',
  );
}

{
  const { listener, seen } = setUp();
  listener.start();
  advance(30);
  listener.stop();
  listener.start();
  assert.deepEqual(
    entries('start-throws'),
    [],
    'a start right after a stop waits for the old session to end instead of throwing',
  );
  advance(30);
  assert.deepEqual(
    [entries('start'), seen.status],
    [[0, 40], 'listening'],
    'and starts again as soon as the old session has ended',
  );
}

(
  [
    ['not-allowed', 'denied'],
    ['service-not-allowed', 'service'],
    ['audio-capture', 'no-microphone'],
    ['language-not-supported', 'language'],
  ] as const
).forEach(([browserError, reason]) => {
  const { listener, seen } = setUp();
  env.startError = browserError;
  listener.start();
  advance(20_000);
  assert.deepEqual(
    [entries('start').length, seen.status, seen.error, seen.halts],
    [1, 'off', reason, [reason]],
    `"${browserError}" stops at once as "${reason}", tells the caller why once, and is never retried`,
  );
});

{
  const { listener, seen } = setUp();
  listener.start();
  advance(30);
  listener.say('Garlic, 6.');
  advance(10);
  assert.equal(seen.status, 'speaking', 'listening stops while it reads aloud');
  assert.equal(hear('next'), false, 'nothing is heard while it reads aloud');
  advance(290);
  advance(40);
  assert.deepEqual(
    [seen.status, entries('start').length],
    ['listening', 2],
    'listening starts again once the reading has ended',
  );
}

{
  const { listener, seen } = setUp();
  listener.start();
  advance(30);
  env.speech = 'never-ends';
  listener.say('Short.');
  advance(4000 + 'Short.'.length * 90 - 1);
  assert.equal(
    seen.status,
    'speaking',
    'a reading that started is given time for its length',
  );
  advance(1);
  advance(40);
  assert.equal(
    seen.status,
    'listening',
    'a reading whose end never comes is ended by the guard for its length',
  );
}

{
  const { listener, seen } = setUp();
  listener.start();
  advance(30);
  env.speech = 'silent';
  listener.say('Garlic, 6.');
  advance(1499);
  assert.equal(
    entries('start').length,
    1,
    'the mic stays off while a reading may still start',
  );
  advance(1);
  advance(40);
  assert.deepEqual(
    [seen.status, entries('start').length],
    ['listening', 2],
    'a reading that never starts is given up after 1.5 s and listening comes back',
  );
  env.log = [];
  listener.say('Soy sauce, a quarter cup.');
  assert.deepEqual(
    env.log.filter((entry) => entry.includes('speak:')),
    [],
    'after a reading that never started, nothing more is read for the session',
  );
}

{
  const { listener, seen } = setUp(
    (alternatives) => alternatives[0] === 'next',
  );
  listener.start();
  advance(30);
  advance(IDLE_MS - 31);
  hear('next');
  advance(IDLE_MS - 1);
  assert.equal(
    seen.status,
    'listening',
    'a used phrase starts the fifteen minutes again',
  );
  hear('the next batch');
  advance(1);
  assert.deepEqual(
    [seen.status, seen.error],
    ['off', 'idle'],
    'a phrase that was not used does not, so listening stops fifteen minutes after the last command',
  );
  advance(20_000);
  assert.equal(
    entries('start').length,
    1,
    'an idle stop never starts again on its own',
  );
  assert.deepEqual(
    seen.halts,
    ['idle'],
    'the caller is told about the idle stop',
  );
}

{
  const { listener, seen } = setUp();
  listener.start();
  advance(30);
  listener.stop();
  advance(100);
  listener.start();
  advance(30);
  listener.teardown();
  assert.deepEqual(
    seen.halts,
    [],
    'a stop the caller asked for, and a teardown, are not reported as the listener stopping by itself',
  );
}

{
  const { listener, seen } = setUp();
  listener.start();
  advance(30);
  listener.suspend();
  advance(20);
  assert.equal(seen.status, 'starting', 'a hidden page stops listening');
  advance(60_000);
  assert.equal(
    entries('start').length,
    1,
    'and nothing restarts while it is hidden',
  );
  listener.resume();
  advance(20);
  assert.deepEqual(
    [seen.status, entries('start').length],
    ['listening', 2],
    'coming back starts it again',
  );
  listener.teardown();
  advance(20_000);
  assert.deepEqual(
    [entries('start').length, clock.tasks.length],
    [2, 0],
    'tearing down leaves no restart or idle timer behind',
  );
}

{
  const { listener, seen } = setUp();
  listener.start();
  advance(30);
  listener.mute(500);
  hear('next');
  assert.deepEqual(
    seen.heard,
    [],
    'what the recognizer returns while a cue sounds is dropped',
  );
  advance(500);
  hear('next');
  assert.deepEqual(
    seen.heard,
    [['next']],
    'and it is heard again once the cue and its tail are over',
  );
  listener.mute(1000);
  listener.mute(200);
  advance(300);
  hear('back');
  assert.equal(
    seen.heard.length,
    1,
    'a shorter mute never cuts a longer one short',
  );
  listener.teardown();
}

console.log('speechListener: all checks passed');

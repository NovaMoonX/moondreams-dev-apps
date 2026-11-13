import {
  PCM_SAMPLE_RATE,
  startPcmCapture,
} from '@/lib/speech/voice/pcmWorklet';
import type { FrameSource } from '@/lib/speech/voice/types';

export interface SpeechGateOptions {
  /** Length of each frame passed to `push`. */
  frameMs?: number;
  /** Speech this long, gaps forgiven, opens the gate. */
  triggerMs?: number;
  /** How much audio from before the trigger is handed over with it. */
  preRollMs?: number;
  /** A frame counts as loud when its energy is this many times the noise floor. */
  floorMargin?: number;
  /** Energy (0 to 1) below which a frame is never loud, however quiet the room. */
  minEnergy?: number;
  /** Zero crossings per sample a voice stays within: below is a hum, above is hiss. */
  crossingBand?: [number, number];
  /** Exact zeros this early are a microphone still starting, not the room, and leave the noise floor alone. */
  settleMs?: number;
}

export interface SpeechGateReading {
  isTriggered: boolean;
  /** The frames just before and including the one that triggered; empty on every other frame. */
  preRoll: Int16Array[];
}

const FLOOR_RISE = 0.05;
const FLOOR_RISE_WHILE_LOUD = 0.01;
const FLOOR_FALL = 0.5;
const FLOOR_MIN = 0.0005;

const readEnergy = (frame: Int16Array) =>
  Math.sqrt(
    frame.reduce((sum, sample) => sum + (sample / 32768) ** 2, 0) /
      Math.max(1, frame.length),
  );

const readCrossings = (frame: Int16Array) =>
  frame.reduce(
    (count, sample, index) =>
      index > 0 && sample >= 0 !== frame[index - 1] >= 0 ? count + 1 : count,
    0,
  ) / Math.max(1, frame.length - 1);

/**
 * Tells a voice from the room without sending anything anywhere. Each 16 kHz frame is speech when its energy clears a
 * slowly following noise floor by a margin and its zero crossings sit in the voice band; `triggerMs` of speech opens
 * the gate once, with the last `preRollMs` of frames so the first word is not lost.
 */
export const createSpeechGate = ({
  frameMs = 30,
  triggerMs = 200,
  preRollMs = 300,
  floorMargin = 3,
  minEnergy = 0.01,
  crossingBand = [0.02, 0.35],
  settleMs = 300,
}: SpeechGateOptions = {}) => {
  const keptFrames = Math.max(1, Math.ceil(preRollMs / frameMs));
  const state = {
    floor: null as number | null,
    speechMs: 0,
    seenMs: 0,
    isTriggered: false,
    recent: [] as Int16Array[],
  };

  const push = (frame: Int16Array): SpeechGateReading => {
    if (state.isTriggered) return { isTriggered: true, preRoll: [] };
    const energy = readEnergy(frame);
    const crossings = readCrossings(frame);
    const floor = state.floor ?? Math.max(energy, FLOOR_MIN);
    const isLoud = energy > Math.max(floor * floorMargin, minEnergy);
    const isVoiced =
      crossings >= crossingBand[0] && crossings <= crossingBand[1];
    const isSpeech = isLoud && isVoiced && state.floor !== null;
    state.seenMs += frameMs;
    state.floor =
      energy === 0 && state.seenMs <= settleMs
        ? state.floor
        : Math.max(
            FLOOR_MIN,
            energy < floor
              ? floor + (energy - floor) * FLOOR_FALL
              : floor +
                  (energy - floor) *
                    (isLoud ? FLOOR_RISE_WHILE_LOUD : FLOOR_RISE),
          );
    state.speechMs = isSpeech
      ? state.speechMs + frameMs
      : Math.max(0, state.speechMs - frameMs);
    state.recent = [...state.recent, frame].slice(-keptFrames);
    if (state.speechMs < triggerMs) return { isTriggered: false, preRoll: [] };
    state.isTriggered = true;
    return { isTriggered: true, preRoll: state.recent };
  };

  return { push };
};

interface SpeechGateHandle {
  close: () => void;
}

const FRAME_MS = (320 / PCM_SAMPLE_RATE) * 1000;

/**
 * Opens the microphone (echo cancellation and noise suppression on, so a line playing through the page is not heard as
 * the person) and runs every frame through a speech gate on the device: nothing leaves it until the gate triggers.
 * `onSpeech` then gets the frames before the trigger and the live frames after, and owns the microphone: it calls
 * `source.stop()` when done. Closing before a trigger releases the microphone. Where the microphone can't open, nothing
 * listens and `onUnavailable` runs.
 */
export const openSpeechGate = ({
  onSpeech,
  onUnavailable,
}: {
  onSpeech: (source: FrameSource) => void;
  onUnavailable?: () => void;
}): SpeechGateHandle => {
  const state = {
    isClosed: false,
    isHandedOver: false,
    stream: null as MediaStream | null,
    capture: null as { stop: () => void } | null,
    subscriber: null as ((frame: ArrayBuffer) => void) | null,
    waiting: [] as ArrayBuffer[],
  };
  const gate = createSpeechGate({ frameMs: FRAME_MS });

  const release = () => {
    state.subscriber = null;
    state.capture?.stop();
    state.capture = null;
    state.stream?.getTracks().forEach((track) => track.stop());
    state.stream = null;
  };

  const handleFrame = (buffer: ArrayBuffer) => {
    if (state.isClosed) return;
    if (state.isHandedOver) {
      if (state.subscriber) state.subscriber(buffer);
      else state.waiting = [...state.waiting, buffer];
      return;
    }
    const reading = gate.push(new Int16Array(buffer));
    if (!reading.isTriggered) return;
    state.isHandedOver = true;
    onSpeech({
      preRoll: reading.preRoll.map((frame) => frame.buffer as ArrayBuffer),
      subscribe: (onFrame) => {
        state.subscriber = onFrame;
        state.waiting.forEach(onFrame);
        state.waiting = [];
      },
      stop: () => {
        state.isClosed = true;
        release();
      },
    });
  };

  navigator.mediaDevices
    .getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        channelCount: 1,
      },
    })
    .then(async (stream) => {
      if (state.isClosed) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      state.stream = stream;
      const capture = await startPcmCapture({ stream, onFrame: handleFrame });
      if (state.isClosed) capture.stop();
      else state.capture = capture;
    })
    .catch((error: unknown) => {
      console.error('The speech gate could not open', error);
      release();
      if (!state.isClosed) onUnavailable?.();
    });

  return {
    close: () => {
      state.isClosed = true;
      release();
    },
  };
};

import { getAudioContext } from '@/lib/speech/audioContext';

export const DUCK_GAIN = 0.25;
const RAMP_SECONDS = 0.05;

const buses = new WeakMap<AudioContext, GainNode>();
const duck = { isOn: false };

/** The node the cloud voice plays into instead of the speakers directly, so a playing line can be turned down without being stopped. */
export const getDuckBus = (context: AudioContext) => {
  const existing = buses.get(context);
  if (existing) return existing;
  const bus = context.createGain();
  bus.gain.value = duck.isOn ? DUCK_GAIN : 1;
  bus.connect(context.destination);
  buses.set(context, bus);
  return bus;
};

/** Turns the line playing through the page's audio down to a quarter (or back up) over a short ramp. */
export const setDucked = (isDucked: boolean) => {
  duck.isOn = isDucked;
  const context = getAudioContext();
  const bus = context ? buses.get(context) : undefined;
  if (!context || !bus) return;
  bus.gain.cancelScheduledValues(context.currentTime);
  bus.gain.setTargetAtTime(
    isDucked ? DUCK_GAIN : 1,
    context.currentTime,
    RAMP_SECONDS,
  );
};

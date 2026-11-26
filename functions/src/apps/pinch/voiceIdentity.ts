import type { TtsProviderId } from '../../voice/voiceConfig.js';

/** Pepper's voice per provider; Google's is the one the cooking mode asks for. */
export const PINCH_VOICE_IDS: Record<TtsProviderId, string> = {
  googleTts: 'en-US-Chirp3-HD-Zephyr',
  deepgramAura: 'aura-2-thalia-en',
  geminiTts: 'Zephyr',
};

/** Pepper's voice first, then the ones that stand in for it, in order. */
export const PINCH_VOICE_NAMES = [
  'Zephyr',
  'Aoede',
  'Erinome',
  'Autonoe',
] as const;

export const PINCH_DEFAULT_VOICE = 'Zephyr';

export const PINCH_SPEED_RANGE = { min: 0.9, max: 1.15 };

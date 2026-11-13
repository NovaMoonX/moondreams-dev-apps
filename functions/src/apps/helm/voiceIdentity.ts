import type { TtsProviderId } from '../../voice/voiceConfig.js';

/** The assistant's one voice per provider, until the benchmark pick replaces the default's entry. */
export const HELM_VOICE_IDS: Record<TtsProviderId, string> = {
  googleTts: 'en-US-Chirp3-HD-Aoede',
  deepgramAura: 'aura-2-thalia-en',
  geminiTts: 'Achird',
};

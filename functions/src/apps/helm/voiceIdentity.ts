import type { TtsProviderId } from '../../voice/voiceConfig.js';

/** The assistant's one voice per provider, until the benchmark pick replaces the default's entry. */
export const HELM_VOICE_IDS: Record<TtsProviderId, string> = {
  googleTts: 'en-US-Chirp3-HD-Aoede',
  deepgramAura: 'aura-2-thalia-en',
  geminiTts: 'Achird',
};

/** The Chirp 3 HD voices a person may pick, by bare name. */
export const HELM_VOICE_NAMES = [
  'Achernar',
  'Achird',
  'Algenib',
  'Algieba',
  'Alnilam',
  'Aoede',
  'Autonoe',
  'Callirrhoe',
  'Charon',
  'Despina',
  'Enceladus',
  'Erinome',
  'Fenrir',
  'Gacrux',
  'Iapetus',
  'Kore',
  'Laomedeia',
  'Leda',
  'Orus',
  'Pulcherrima',
  'Puck',
  'Rasalgethi',
  'Sadachbia',
  'Sadaltager',
  'Schedar',
  'Sulafat',
  'Umbriel',
  'Vindemiatrix',
  'Zephyr',
  'Zubenelgenubi',
] as const;

export const HELM_DEFAULT_VOICE = 'Aoede';

export const HELM_SPEED_RANGE = { min: 0.8, max: 1.2 };

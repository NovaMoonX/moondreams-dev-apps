export type HelmVoiceGender = 'female' | 'male';
export type HelmVoiceGroup = 'calm' | 'clear' | 'lively';

export interface HelmVoice {
  /** The bare Chirp 3 HD name the server speaks with. */
  name: string;
  gender: HelmVoiceGender;
  /** Google's own word for how it sounds. */
  feel: string;
  group: HelmVoiceGroup;
}

const voice = (
  name: string,
  gender: HelmVoiceGender,
  group: HelmVoiceGroup,
  feel: string,
): HelmVoice => ({ name, gender, feel, group });

export const HELM_VOICES: readonly HelmVoice[] = [
  voice('Achernar', 'female', 'calm', 'soft'),
  voice('Despina', 'female', 'calm', 'smooth'),
  voice('Callirrhoe', 'female', 'calm', 'easy-going'),
  voice('Vindemiatrix', 'female', 'calm', 'gentle'),
  voice('Sulafat', 'female', 'calm', 'warm'),
  voice('Gacrux', 'female', 'calm', 'mature'),
  voice('Kore', 'female', 'clear', 'firm'),
  voice('Erinome', 'female', 'clear', 'clear'),
  voice('Pulcherrima', 'female', 'clear', 'forward'),
  voice('Zephyr', 'female', 'lively', 'bright'),
  voice('Autonoe', 'female', 'lively', 'bright'),
  voice('Laomedeia', 'female', 'lively', 'upbeat'),
  voice('Leda', 'female', 'lively', 'youthful'),
  voice('Aoede', 'female', 'lively', 'breezy'),
  voice('Enceladus', 'male', 'calm', 'breathy'),
  voice('Algieba', 'male', 'calm', 'smooth'),
  voice('Umbriel', 'male', 'calm', 'easy-going'),
  voice('Schedar', 'male', 'calm', 'even'),
  voice('Algenib', 'male', 'calm', 'gravelly'),
  voice('Orus', 'male', 'clear', 'firm'),
  voice('Alnilam', 'male', 'clear', 'firm'),
  voice('Iapetus', 'male', 'clear', 'clear'),
  voice('Charon', 'male', 'clear', 'informative'),
  voice('Rasalgethi', 'male', 'clear', 'informative'),
  voice('Sadaltager', 'male', 'clear', 'knowledgeable'),
  voice('Puck', 'male', 'lively', 'upbeat'),
  voice('Fenrir', 'male', 'lively', 'excitable'),
  voice('Achird', 'male', 'lively', 'friendly'),
  voice('Zubenelgenubi', 'male', 'lively', 'casual'),
  voice('Sadachbia', 'male', 'lively', 'lively'),
];

export const HELM_DEFAULT_VOICE = 'Aoede';

/** From slower to faster; 1 is normal pace. */
export const HELM_VOICE_SPEEDS = [0.8, 0.9, 1, 1.1, 1.2] as const;

export const HELM_VOICE_GROUPS: readonly HelmVoiceGroup[] = [
  'calm',
  'clear',
  'lively',
];

/** The voice a stored name stands for; the default when it is null or no longer one Helm offers. */
export const findHelmVoice = (name: string | null): HelmVoice =>
  HELM_VOICES.find((entry) => entry.name === name) ??
  HELM_VOICES.find((entry) => entry.name === HELM_DEFAULT_VOICE) ??
  HELM_VOICES[0]!;

/** The speed a stored value stands for: the nearest notch, normal when null. */
export const toHelmVoiceSpeed = (speed: number | null): number =>
  HELM_VOICE_SPEEDS.reduce(
    (best, notch) =>
      Math.abs(notch - (speed ?? 1)) < Math.abs(best - (speed ?? 1))
        ? notch
        : best,
    1 as number,
  );

/** A feel as the first word of a subtitle ("Easy-going"). */
export const toFeelLabel = (feel: string) =>
  `${feel.charAt(0).toUpperCase()}${feel.slice(1)}`;

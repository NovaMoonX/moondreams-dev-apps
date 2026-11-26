import {
  HELM_DEFAULT_VOICE,
  HELM_SPEED_RANGE,
  HELM_VOICE_IDS,
  HELM_VOICE_NAMES,
} from '../apps/helm/voiceIdentity.js';
import {
  PINCH_DEFAULT_VOICE,
  PINCH_SPEED_RANGE,
  PINCH_VOICE_IDS,
  PINCH_VOICE_NAMES,
} from '../apps/pinch/voiceIdentity.js';
import {
  STT_FLUX_MODEL,
  STT_MODEL,
  type VoiceAppLimits,
} from './voiceConfig.js';

export const VOICE_APPS: Record<string, VoiceAppLimits> = {
  helm: {
    listenMsPerDay: 3_600_000,
    mintsPerDay: 300,
    spokenCharsPerDay: 30_000,
    voices: HELM_VOICE_IDS,
    voiceNames: HELM_VOICE_NAMES,
    defaultVoice: HELM_DEFAULT_VOICE,
    speedRange: HELM_SPEED_RANGE,
    sttModel: STT_MODEL,
    fallbackVoices: [],
    gate: null,
  },
  pinch: {
    listenMsPerDay: 3_600_000,
    mintsPerDay: 400,
    spokenCharsPerDay: 30_000,
    voices: PINCH_VOICE_IDS,
    voiceNames: PINCH_VOICE_NAMES,
    defaultVoice: PINCH_DEFAULT_VOICE,
    speedRange: PINCH_SPEED_RANGE,
    sttModel: STT_FLUX_MODEL,
    fallbackVoices: PINCH_VOICE_NAMES.slice(1),
    gate: { id: 'pepper', defaultRollout: 'testing' },
  },
};

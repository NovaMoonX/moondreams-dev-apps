import { HELM_VOICE_IDS } from '../apps/helm/voiceIdentity.js';
import type { VoiceAppLimits } from './voiceConfig.js';

export const VOICE_APPS: Record<string, VoiceAppLimits> = {
  helm: {
    listenMsPerDay: 3_600_000,
    mintsPerDay: 300,
    spokenCharsPerDay: 30_000,
    voices: HELM_VOICE_IDS,
  },
};

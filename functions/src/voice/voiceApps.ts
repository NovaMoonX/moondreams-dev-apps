import type { VoiceAppLimits } from './voiceConfig.js';

export const VOICE_APPS: Record<string, VoiceAppLimits> = {
  helm: {
    listenMsPerDay: 3_600_000,
    mintsPerDay: 300,
    spokenCharsPerDay: 30_000,
  },
};

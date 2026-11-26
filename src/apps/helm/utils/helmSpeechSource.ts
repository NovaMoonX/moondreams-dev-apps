import { createSpeechSource } from '@/lib/speech/voice/speechSource';
import { store } from '@/store';
import {
  getHttpFunctionUrl,
  getSignedHeaders,
} from '@lib/firebase/httpFunction';

export const readHelmVoice = () => {
  const profile = store.getState().helm.profile;
  return {
    voiceId: profile?.voiceId ?? null,
    speed: profile?.voiceSpeed ?? null,
  };
};

export const createHelmSpeechSource = () =>
  createSpeechSource({
    appId: 'helm',
    url: getHttpFunctionUrl('streamSpeech'),
    getHeaders: getSignedHeaders,
    readVoice: readHelmVoice,
  });

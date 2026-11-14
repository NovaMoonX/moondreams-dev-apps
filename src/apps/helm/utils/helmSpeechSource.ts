import { getToken } from 'firebase/app-check';

import { createSpeechSource } from '@/lib/speech/voice/speechSource';
import { store } from '@/store';
import {
  app,
  appCheck,
  auth,
  isUsingFirebaseEmulators,
} from '@lib/firebase/config';

const getSpeechUrl = () => {
  const { projectId } = app.options;
  return isUsingFirebaseEmulators
    ? `http://${window.location.hostname}:5001/${projectId}/us-central1/streamSpeech`
    : `https://us-central1-${projectId}.cloudfunctions.net/streamSpeech`;
};

const getSpeechHeaders = async () => {
  const { currentUser } = auth;
  if (!currentUser || !appCheck) return null;
  const [idToken, appCheckToken] = await Promise.all([
    currentUser.getIdToken(),
    getToken(appCheck),
  ]);
  return {
    Authorization: `Bearer ${idToken}`,
    'X-Firebase-AppCheck': appCheckToken.token,
  };
};

/** The assistant's speech endpoint, asking for the voice and speed on the person's profile at each request. */
export const createHelmSpeechSource = () =>
  createSpeechSource({
    appId: 'helm',
    url: getSpeechUrl(),
    getHeaders: getSpeechHeaders,
    readVoice: () => {
      const profile = store.getState().helm.profile;
      return {
        voiceId: profile?.voiceId ?? null,
        speed: profile?.voiceSpeed ?? null,
      };
    },
  });

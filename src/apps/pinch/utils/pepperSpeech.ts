import { createSpeechSource } from '@/lib/speech/voice/speechSource';
import {
  getHttpFunctionUrl,
  getSignedHeaders,
} from '@lib/firebase/httpFunction';

/** Pepper's voice: the server's default for the app (Zephyr), never a pick. */
export const createPepperSpeechSource = () =>
  createSpeechSource({
    appId: 'pinch',
    url: getHttpFunctionUrl('streamSpeech'),
    getHeaders: getSignedHeaders,
    readVoice: () => ({ voiceId: null, speed: null }),
  });

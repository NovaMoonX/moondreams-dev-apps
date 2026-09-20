import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';

import { app } from './config';

export const ai = getAI(app, {
  backend: new GoogleAIBackend(),
});

export const generativeModel = getGenerativeModel(ai, {
  model: import.meta.env.VITE_FIREBASE_AI_MODEL || 'gemini-3.5-flash-lite',
  generationConfig: {
    responseMimeType: 'application/json',
  },
});

export type ToVoiceWorker =
  | {
      type: 'init';
      modelUrl: string;
      configUrl: string;
      cacheName: string;
    }
  | { type: 'synth'; id: number; text: string }
  | { type: 'cancel' };

export type FromVoiceWorker =
  | { type: 'ready'; sampleRate: number }
  | { type: 'audio'; id: number; pcm: Float32Array; sampleRate: number }
  | { type: 'cancelled'; id: number }
  | { type: 'failed'; id: number | null; message: string };

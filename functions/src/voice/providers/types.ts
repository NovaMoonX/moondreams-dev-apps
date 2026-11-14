import type { TtsProviderId } from '../voiceConfig.js';

export type TtsFormat = 'mp3' | 'opus';

export interface TtsSpeech {
  stream: ReadableStream<Uint8Array>;
  contentType: string;
}

export interface TtsProvider {
  id: TtsProviderId;
  speak(input: {
    text: string;
    voiceId: string;
    format: TtsFormat;
    signal?: AbortSignal;
    /** Speaking rate, 1 is normal; a provider with no rate control ignores it. */
    speed?: number;
    /** How to say it ("Say this in a calm, even voice"); only a provider that reads instructions uses it. */
    delivery?: string;
  }): Promise<TtsSpeech>;
}

export const AUDIO_CONTENT_TYPES: Record<TtsFormat, string> = {
  mp3: 'audio/mpeg',
  opus: 'audio/ogg; codecs=opus',
};

/** Names the provider and status only: a body or header could carry the key. */
export const failedSpeech = (provider: TtsProviderId, status: number) =>
  new Error(`${provider} answered ${status}`);

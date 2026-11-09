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
  }): Promise<TtsSpeech>;
}

export const AUDIO_CONTENT_TYPES: Record<TtsFormat, string> = {
  mp3: 'audio/mpeg',
  opus: 'audio/ogg; codecs=opus',
};

/** Names the provider and status only: a body or header could carry the key. */
export const failedSpeech = (provider: TtsProviderId, status: number) =>
  new Error(`${provider} answered ${status}`);

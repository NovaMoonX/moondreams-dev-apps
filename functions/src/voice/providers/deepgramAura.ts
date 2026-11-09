import {
  AUDIO_CONTENT_TYPES,
  failedSpeech,
  type TtsProvider,
} from './types.js';

export function createDeepgramAura({
  apiKey,
  fetchImpl = fetch,
}: {
  apiKey: string;
  fetchImpl?: typeof fetch;
}): TtsProvider {
  return {
    id: 'deepgramAura',
    async speak({ text, voiceId, format, signal }) {
      // Opus in an Ogg container is unverified: the docs list the pair but it has not been played.
      const query = new URLSearchParams({
        model: voiceId,
        encoding: format,
        ...(format === 'opus' ? { container: 'ogg' } : {}),
        mip_opt_out: 'true',
      });
      const res = await fetchImpl(
        `https://api.deepgram.com/v1/speak?${query.toString()}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Token ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text }),
          signal,
        },
      );
      if (!res.ok || res.body === null)
        throw failedSpeech('deepgramAura', res.status);
      return { stream: res.body, contentType: AUDIO_CONTENT_TYPES[format] };
    },
  };
}

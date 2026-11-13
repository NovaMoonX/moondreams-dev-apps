import {
  AUDIO_CONTENT_TYPES,
  failedSpeech,
  type TtsProvider,
} from './types.js';

const ENCODINGS = { mp3: 'MP3', opus: 'OGG_OPUS' } as const;

export function createGoogleTts({
  getAccessToken,
  projectId,
  fetchImpl = fetch,
}: {
  getAccessToken: () => Promise<string>;
  projectId: string;
  fetchImpl?: typeof fetch;
}): TtsProvider {
  return {
    id: 'googleTts',
    async speak({ text, voiceId, format, signal }) {
      const res = await fetchImpl(
        'https://texttospeech.googleapis.com/v1/text:synthesize',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${await getAccessToken()}`,
            'x-goog-user-project': projectId,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            input: { text },
            voice: { languageCode: 'en-US', name: voiceId },
            audioConfig: { audioEncoding: ENCODINGS[format] },
          }),
          signal,
        },
      );
      if (!res.ok) {
        await res.body?.cancel();
        throw failedSpeech('googleTts', res.status);
      }
      const { audioContent } = (await res.json()) as {
        audioContent?: unknown;
      };
      if (typeof audioContent !== 'string' || audioContent === '')
        throw failedSpeech('googleTts', res.status);
      // Streaming synthesis is gRPC only, so the REST answer is the whole clip in one chunk.
      const bytes = new Uint8Array(Buffer.from(audioContent, 'base64'));
      return {
        stream: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes);
            controller.close();
          },
        }),
        contentType: AUDIO_CONTENT_TYPES[format],
      };
    },
  };
}

import { failedSpeech, type TtsProvider } from './types.js';

const MODEL = 'gemini-3.8-flash-lite-tts';

interface SseEvent {
  candidates?: {
    content?: { parts?: { inlineData?: { data?: string } }[] };
  }[];
}

const readAudioChunks = (data: string) => {
  const event = JSON.parse(data) as SseEvent;
  return (event.candidates?.[0]?.content?.parts ?? []).flatMap((part) =>
    part.inlineData?.data
      ? [new Uint8Array(Buffer.from(part.inlineData.data, 'base64'))]
      : [],
  );
};

const toAudioStream = (body: ReadableStream<Uint8Array>) => {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  const queue: Uint8Array[] = [];
  const takeLines = (isLast: boolean) => {
    const lines = pending.split('\n');
    pending = isLast ? '' : (lines.pop() ?? '');
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) return;
      const data = trimmed.slice('data:'.length).trim();
      if (data) queue.push(...readAudioChunks(data));
    });
  };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (queue.length === 0) {
        const { done, value } = await reader.read();
        pending += decoder.decode(value, { stream: !done });
        takeLines(done);
        if (done && queue.length === 0) {
          controller.close();
          return;
        }
      }
      controller.enqueue(queue.shift() as Uint8Array);
    },
    cancel: (reason) => reader.cancel(reason),
  });
};

export function createGeminiTts({
  apiKey,
  fetchImpl = fetch,
}: {
  apiKey: string;
  fetchImpl?: typeof fetch;
}): TtsProvider {
  return {
    id: 'geminiTts',
    // Gemini streams raw PCM only, so `format` is ignored.
    async speak({ text, voiceId, signal }) {
      const res = await fetchImpl(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse`,
        {
          method: 'POST',
          headers: {
            'x-goog-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text }] }],
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceId } },
              },
            },
          }),
          signal,
        },
      );
      if (!res.ok || res.body === null)
        throw failedSpeech('geminiTts', res.status);
      return {
        stream: toAudioStream(res.body),
        contentType: 'audio/L16; rate=24000; channels=1',
      };
    },
  };
}

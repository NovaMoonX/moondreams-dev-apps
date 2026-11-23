import { logger } from 'firebase-functions';

import { createOptionalSecretReader } from '../../../imageSearch/optionalSecret.js';

const MODEL = 'gemini-3.5-flash-lite';
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const TIMEOUT_MS = 12_000;

const readSecret = createOptionalSecretReader({ fetch: globalThis.fetch });

/** One JSON answer from Gemini under a response schema, at temperature 0. `null` when the key is missing, the call fails or the answer is not JSON; never throws. */
export async function askGemini(
  instruction: string,
  input: string,
  schema: Record<string, unknown>,
): Promise<unknown> {
  try {
    const key = await readSecret('GEMINI_API_KEY', AbortSignal.timeout(4_000));
    if (key === null) return null;
    const response = await fetch(URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instruction }] },
        contents: [{ role: 'user', parts: [{ text: input }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      logger.warn('runway.email.aiFailed', { status: response.status });
      return null;
    }
    const body = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    return typeof text === 'string' ? JSON.parse(text) : null;
  } catch (error) {
    logger.warn('runway.email.aiFailed', {
      name: (error as Error)?.name ?? 'Error',
    });
    return null;
  }
}

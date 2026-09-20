import { generativeModel } from '@/lib/firebase/ai';

import { compressIngestionImage } from '../utils/imageCompression';
import {
  buildExtractionPrompt,
  dropFutureEvents,
  endOfToday,
  normalizeProposal,
  responseSchema,
  type ExtractedIngestionProposal,
} from './ingestionExtractionShared';

export type { ExtractedIngestionProposal };

function asBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

export async function extractProposalFromFile(file: File): Promise<ExtractedIngestionProposal> {
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const inputFile = await compressIngestionImage(file);
  const data = asBase64(await inputFile.arrayBuffer());
  const result = await generativeModel.generateContent({
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: buildExtractionPrompt(today, `The source filename is "${file.name}".`),
          },
          {
            inlineData: {
              data,
              mimeType: inputFile.type || file.type,
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema,
    },
  });
  const parsed = JSON.parse(result.response.text()) as Partial<ExtractedIngestionProposal>;

  return dropFutureEvents(normalizeProposal(parsed), endOfToday(now));
}

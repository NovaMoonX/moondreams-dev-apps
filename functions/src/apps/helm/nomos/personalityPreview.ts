import type { TerminalTool } from '../../../ai/modelProvider.js';
import {
  PREVIEW_PROMPTS,
  fixedSampleFor,
  personalityHash,
  toPersonalityPrompt,
  type Personality,
} from './personality.js';

export const PREVIEW_REPLY_CAP = 240;

const FIXTURE_EVERYDAY_REPLY = 'Nothing has come in about Saturday yet.';

export const SUBMIT_REPLIES_TOOL: TerminalTool = {
  name: 'submit_replies',
  description:
    'Sends one reply for each message, in the order given. Call it once, last.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['replies'],
    properties: { replies: { type: 'array', items: { type: 'string' } } },
  },
};

export const buildPreviewSystem = (name: string, personality: Personality) =>
  `You are ${name}, a personal assistant. This is how you talk:
<personality>
${toPersonalityPrompt(personality)}
</personality>
Reply to each numbered message the way you would to the person: one reply per message, in order, at most ${PREVIEW_REPLY_CAP} characters each, no emoji and no exclamation marks. You know nothing about the person beyond the message, so never invent a fact; answer the hard one with a view and the easy one honestly, even if that is "not yet".`;

export const buildPreviewMessage = () =>
  PREVIEW_PROMPTS.map((prompt, index) => `${index + 1}. ${prompt}`).join('\n');

/** One reply as the person may read it: no emoji, no exclamation marks, cut at a word within the cap; empty when nothing is left. */
export const cleanPreviewReply = (value: unknown) => {
  const plain =
    typeof value === 'string'
      ? value
          .replace(/[\p{Extended_Pictographic}️‍]/gu, '')
          .replace(/!+/g, '.')
          .replace(/([.?])\.+/g, '$1')
          .replace(/\s+/g, ' ')
          .trim()
      : '';
  if (plain.length <= PREVIEW_REPLY_CAP) return plain;
  const cut = plain.slice(0, PREVIEW_REPLY_CAP - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 1)).replace(/[,;:\s]+$/, '')}…`;
};

/** The model's replies, one per fixed prompt, or null when any is missing. */
export const readPreviewReplies = (value: unknown): string[] | null => {
  const replies = (Array.isArray(value) ? value : [])
    .slice(0, PREVIEW_PROMPTS.length)
    .map(cleanPreviewReply);
  return replies.length === PREVIEW_PROMPTS.length &&
    replies.every((reply) => reply !== '')
    ? replies
    : null;
};

/** The stored replies when they were made for this very personality; null otherwise, so a model is asked only once per personality. */
export const reusePreview = (
  stored: unknown,
  personality: Personality,
): string[] | null => {
  const record =
    typeof stored === 'object' && stored !== null
      ? (stored as Record<string, unknown>)
      : null;
  return record !== null && record.hash === personalityHash(personality)
    ? readPreviewReplies(record.replies)
    : null;
};

/** What the emulator answers with no model key. */
export const buildFixturePreview = (personality: Personality) => [
  fixedSampleFor(personality),
  FIXTURE_EVERYDAY_REPLY,
];

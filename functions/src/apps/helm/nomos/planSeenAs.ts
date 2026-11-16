import type { SealedPayload } from '../../../appKeys/seal.js';
import type { SeenAsRecord } from '../seenAsStore.js';
import type { SeenAsCommand } from './commands.js';
import type { Effect, EffectRef } from './executeCommands.js';
import { cutCorrection, isRefusedLine, normaliseClaim } from './seenAs.js';

export interface SeenAsPlanInput {
  commands: SeenAsCommand[];
  records: ReadonlyMap<string, SeenAsRecord>;
  now: number;
  seal: (fields: Record<string, unknown>) => SealedPayload;
  /** How many effects the turn can still record. */
  room: number;
}

export interface SeenAsPlan {
  updates: { id: string; data: Record<string, unknown> }[];
  effectRefs: EffectRef[];
  effects: Effect[];
  lines: string[];
  notKept: string[];
  isPrivate: boolean;
}

const EMPTY: SeenAsPlan = {
  updates: [],
  effectRefs: [],
  effects: [],
  lines: [],
  notKept: [],
  isPrivate: false,
};

export const buildSeenAsChangedLine = (words: string) => `Changed it: ${words}`;
export const SEEN_AS_REMOVED_LINE = 'Removed it.';
const GONE_LINE = "that line wasn't there any more";
const ALREADY_LINE = 'that line was already changed in this turn';
const REMOVED_LINE = 'that line was already removed';

/** What the person's correction or removal writes, without touching a database. Correct sets the person's words, marks the line the person's and private when the words are about something refused; Remove keeps the record with its claim folded and its sources marked "don't draw this". Each effect holds the fields as they were, so Undo puts the record back exactly. */
export function planSeenAs(input: SeenAsPlanInput): SeenAsPlan {
  return input.commands.reduce<SeenAsPlan>((plan, command) => {
    const record = input.records.get(command.lineId);
    const skip = (reason: string): SeenAsPlan => ({
      ...plan,
      notKept: [...plan.notKept, reason],
    });
    if (plan.effects.length >= input.room) return plan;
    if (plan.updates.some(({ id }) => id === command.lineId))
      return skip(ALREADY_LINE);
    if (!record || !record.words) return skip(GONE_LINE);
    if (record.state === 'removed') return skip(REMOVED_LINE);
    const ref: EffectRef = {
      op: 'update',
      collection: 'seenAs',
      docId: record.id,
    };
    const { words } = record;
    if (command.kind === 'correctSeenAs') {
      const corrected = cutCorrection(command.words);
      if (corrected === '') return skip('those words were empty');
      const privacy = isRefusedLine(corrected, false)
        ? 'private'
        : record.privacy;
      return {
        updates: [
          ...plan.updates,
          {
            id: record.id,
            data: {
              state: 'corrected',
              correctedAt: input.now,
              writtenBy: 'person',
              privacy,
              sealed: input.seal({ ...words, corrected }),
            },
          },
        ],
        effectRefs: [...plan.effectRefs, ref],
        effects: [
          ...plan.effects,
          {
            written: {
              state: 'corrected',
              correctedAt: input.now,
              writtenBy: 'person',
              privacy,
              'sealed.corrected': corrected,
            },
            previous: {
              state: record.state,
              correctedAt: record.correctedAt,
              writtenBy: record.writtenBy,
              privacy: record.privacy,
              'sealed.corrected': words.corrected,
            },
          },
        ],
        lines: [...plan.lines, buildSeenAsChangedLine(corrected)],
        notKept: plan.notKept,
        isPrivate: plan.isPrivate || privacy === 'private',
      };
    }
    const claim = normaliseClaim(words.line);
    return {
      updates: [
        ...plan.updates,
        {
          id: record.id,
          data: {
            state: 'removed',
            removedAt: input.now,
            dontDrawFrom: record.sourceKeys,
            sealed: input.seal({ ...words, line: claim, corrected: null }),
          },
        },
      ],
      effectRefs: [...plan.effectRefs, ref],
      effects: [
        ...plan.effects,
        {
          written: {
            state: 'removed',
            removedAt: input.now,
            dontDrawFrom: record.sourceKeys,
            'sealed.line': claim,
            'sealed.corrected': null,
          },
          previous: {
            state: record.state,
            removedAt: record.removedAt,
            dontDrawFrom: record.dontDrawFrom,
            'sealed.line': words.line,
            'sealed.corrected': words.corrected,
          },
        },
      ],
      lines: [...plan.lines, SEEN_AS_REMOVED_LINE],
      notKept: plan.notKept,
      isPrivate: plan.isPrivate || record.privacy === 'private',
    };
  }, EMPTY);
}

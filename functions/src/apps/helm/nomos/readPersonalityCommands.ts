import { toComparable } from '../../../vendor/optionMatchUtils.js';
import {
  type SetPersonalityCommand,
  MAX_PERSONALITY_PER_TURN,
} from './commands.js';
import {
  HONESTY_LEVELS,
  PERSONALITY_TRAITS,
  type Personality,
} from './personality.js';
import { applyPersonalityCommand } from './planPersonality.js';
import { sliceOfCapture } from './readHabitCommands.js';

export type PersonalityDrop =
  | 'personality-unasked'
  | 'personality-empty'
  | 'personality-extra'
  | 'personality-cap';

export interface PersonalityReadContext {
  captureText?: string;
  /** The personality the person has now, for the cap. */
  current?: Personality;
}

const readTraits = (value: unknown) =>
  Array.isArray(value)
    ? Array.from(
        new Set(
          value.filter((entry): entry is (typeof PERSONALITY_TRAITS)[number] =>
            PERSONALITY_TRAITS.some((trait) => trait === entry),
          ),
        ),
      )
    : [];

/** Reads the reply's request to change how the assistant talks. Only the closed set is kept; the request's own words must be found in the capture, so a turn that never asked changes nothing; at most one per turn; a trait the cap would leave out is a drop so code's line replaces the model's. */
export const readPersonalityCommands = (
  items: Record<string, unknown>[],
  context: PersonalityReadContext,
): { commands: SetPersonalityCommand[]; dropped: PersonalityDrop[] } => {
  const text = context.captureText ?? '';
  return items
    .filter((item) => item.kind === 'setPersonality')
    .reduce<{ commands: SetPersonalityCommand[]; dropped: PersonalityDrop[] }>(
      (acc, item) => {
        const drop = (code: PersonalityDrop) => ({
          ...acc,
          dropped: [...acc.dropped, code],
        });
        if (acc.commands.length >= MAX_PERSONALITY_PER_TURN)
          return drop('personality-extra');
        const quote =
          typeof item.requestQuote === 'string' &&
          toComparable(item.requestQuote) !== ''
            ? sliceOfCapture(text, item.requestQuote)
            : null;
        if (quote === null) return drop('personality-unasked');
        const command: SetPersonalityCommand = {
          kind: 'setPersonality',
          addTraits: readTraits(item.addTraits),
          removeTraits: readTraits(item.removeTraits),
          honesty:
            HONESTY_LEVELS.find((level) => level === item.honesty) ?? null,
        };
        if (
          command.addTraits.length === 0 &&
          command.removeTraits.length === 0 &&
          command.honesty === null
        )
          return drop('personality-empty');
        const isOverCap =
          context.current !== undefined &&
          applyPersonalityCommand(context.current, command).overCap.length > 0;
        return {
          commands: [...acc.commands, command],
          dropped: isOverCap
            ? [...acc.dropped, 'personality-cap']
            : acc.dropped,
        };
      },
      { commands: [], dropped: [] },
    );
};

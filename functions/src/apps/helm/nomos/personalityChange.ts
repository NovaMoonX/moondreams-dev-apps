import type { SetPersonalityCommand } from './commands.js';
import {
  MAX_TRAITS,
  readPersonality,
  type Personality,
} from './personality.js';

/** The personality a request leaves: removals first, then additions up to the cap; what the cap leaves out is returned so code can say so. */
export const applyPersonalityCommand = (
  current: Personality,
  command: SetPersonalityCommand,
) => {
  const remaining = current.traits.filter(
    (trait) => !command.removeTraits.includes(trait),
  );
  const adds = Array.from(new Set(command.addTraits)).filter(
    (trait) =>
      !remaining.includes(trait) && !command.removeTraits.includes(trait),
  );
  const room = Math.max(0, MAX_TRAITS - remaining.length);
  return {
    next: readPersonality(
      {
        traits: [...remaining, ...adds.slice(0, room)],
        honesty: command.honesty ?? current.honesty,
        keptClashes: current.keptClashes,
      },
      null,
    ),
    overCap: adds.slice(room),
  };
};

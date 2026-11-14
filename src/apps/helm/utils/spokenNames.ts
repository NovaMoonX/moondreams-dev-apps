import { createOptionMatcher, toComparable } from '@/utils/optionMatchUtils';
import type { HeardName } from '@apps/helm/types';

/** A record a heard word can be read as: a person, pet, organization, place or project, with the forms it answers to. */
export interface NameRecord {
  id: string;
  name: string;
  aliases: string[];
  /** "Also heard as": forms the recognizer got wrong before; they read as the name but are never a name. */
  soundsLike: string[];
}

export interface SpokenName {
  start: number;
  end: number;
  heard: string;
  recordId: string;
}

export interface SwappedWords {
  text: string;
  /** Where each swapped name now sits in `text`. */
  swaps: (SpokenName & { name: string })[];
  heardNames: HeardName[];
}

const MAX_HEARD_NAMES = 10;

const matcher = createOptionMatcher<NameRecord>({
  names: (record) => [record.name, ...record.aliases],
  soundsLike: (record) => record.soundsLike,
  sounds: true,
});

/** The words of a transcript that sound like exactly one known name, clearly the closest; private records are read here, since this never leaves the device. */
export const readSpokenNames = (
  transcript: string,
  names: readonly NameRecord[],
): SpokenName[] =>
  matcher.matchSounds(transcript, names).matches.map((hit) => ({
    start: hit.start,
    end: hit.end,
    heard: hit.heard,
    recordId: hit.option.id,
  }));

const toTie = (
  heard: string,
  options: [NameRecord, NameRecord],
): HeardName => ({
  heard,
  said: null,
  recordId: null,
  candidateIds: options.map((option) => option.id),
});

/** What a spoken turn says once each clear sound-alike is shown as the name: the words to send, where the swaps sit, and the names to seal with the turn. `restored` holds forms the person chose to keep as said. */
export const readSwappedWords = (
  transcript: string,
  names: readonly NameRecord[],
  restored: readonly string[] = [],
): SwappedWords => {
  const { matches, ties } = matcher.matchSounds(transcript, names);
  const isRestored = (heard: string) => restored.includes(toComparable(heard));
  const kept = matches.filter((hit) => !isRestored(hit.heard));
  const built = kept.reduce(
    (result, hit) => {
      const start = result.text.length + (hit.start - result.at);
      const text = `${result.text}${transcript.slice(result.at, hit.start)}${hit.name}`;
      return {
        text,
        at: hit.end,
        swaps: [
          ...result.swaps,
          {
            start,
            end: text.length,
            heard: hit.heard,
            name: hit.name,
            recordId: hit.option.id,
          },
        ],
      };
    },
    { text: '', at: 0, swaps: [] as SwappedWords['swaps'] },
  );
  const heardNames: HeardName[] = [
    ...kept.map((hit) => ({
      heard: hit.heard,
      said: hit.name,
      recordId: hit.option.id,
      candidateIds: [],
    })),
    ...matches
      .filter((hit) => isRestored(hit.heard))
      .map((hit) => ({
        heard: hit.heard,
        said: null,
        recordId: null,
        candidateIds: [],
      })),
    ...ties.map((tie) => toTie(tie.heard, tie.options)),
  ];

  return {
    text: `${built.text}${transcript.slice(built.at)}`,
    swaps: built.swaps,
    heardNames: heardNames.slice(0, MAX_HEARD_NAMES),
  };
};

/** What typed words may have meant, for the model only: nothing in the words changes and nothing is underlined. Null when no word sounds like a known name. */
export const readTypedHeardNames = (
  text: string,
  names: readonly NameRecord[],
): HeardName[] | null => {
  const { matches, ties } = matcher.matchSounds(text, names);
  const found: HeardName[] = [
    ...matches.map((hit) => ({
      heard: hit.heard,
      said: null,
      recordId: hit.option.id,
      candidateIds: [],
    })),
    ...ties.map((tie) => toTie(tie.heard, tie.options)),
  ].slice(0, MAX_HEARD_NAMES);

  return found.length > 0 ? found : null;
};

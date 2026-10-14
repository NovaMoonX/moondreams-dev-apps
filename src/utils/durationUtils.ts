const MAX_DURATION_SECONDS = 24 * 60 * 60;
const MAX_TEXT_CHARS = 5000;
const SECONDS_PER_UNIT = { h: 3600, min: 60, sec: 1 } as const;
type DurationUnit = keyof typeof SECONDS_PER_UNIT;

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 0.5,
  '¼': 0.25,
  '¾': 0.75,
};

const NUMBER = String.raw`\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?\s?[½¼¾]?|[½¼¾]`;
const UNIT = String.raw`(?<h>hours?|hrs?)|(?<min>minutes?|mins?)|(?<sec>seconds?|secs?)`;
const QUANTITY = new RegExp(
  String.raw`(?<![\d.\/])(?<low>${NUMBER})(?:\s?(?:-|–|—|to|or)\s?(?<high>${NUMBER}))?[\s-]?(?:${UNIT})\b`,
  'gi',
);
const SPOKEN = /\b(?<spoken>half an hour|an hour)\b/gi;
const JOINER = /^[\s,]*(?:and\s+)?$/i;
const UNIT_ORDER: DurationUnit[] = ['h', 'min', 'sec'];

export interface FoundDuration {
  seconds: number;
  text: string;
}

interface Piece {
  index: number;
  end: number;
  text: string;
  unit: DurationUnit | null;
  isRange: boolean;
  seconds: number;
}

const readNumber = (text: string): number => {
  const trimmed = text.trim();
  const mixed = trimmed.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fraction = trimmed.match(/^(\d+)\/(\d+)$/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  const withGlyph = trimmed.match(/^(\d+(?:\.\d+)?)?\s?([½¼¾])$/);
  if (withGlyph)
    return Number(withGlyph[1] ?? 0) + UNICODE_FRACTIONS[withGlyph[2]];
  return Number(trimmed);
};

const getUnit = (groups: Record<string, string | undefined>): DurationUnit =>
  groups.h ? 'h' : groups.min ? 'min' : 'sec';

const getQuantityPieces = (text: string): Piece[] =>
  [...text.matchAll(QUANTITY)].map((match) => {
    const groups = match.groups ?? {};
    const unit = getUnit(groups);
    const high = groups.high;
    const value = readNumber(high ?? groups.low);
    return {
      index: match.index,
      end: match.index + match[0].length,
      text: match[0],
      unit,
      isRange: high !== undefined,
      seconds: Math.round(value * SECONDS_PER_UNIT[unit]),
    };
  });

const getSpokenPieces = (text: string): Piece[] =>
  [...text.matchAll(SPOKEN)].map((match) => ({
    index: match.index,
    end: match.index + match[0].length,
    text: match[0],
    unit: null,
    isRange: false,
    seconds: match[0].toLowerCase().startsWith('half') ? 1800 : 3600,
  }));

const getUnitRank = (piece: Piece) =>
  piece.unit === null ? -1 : UNIT_ORDER.indexOf(piece.unit);

const joinPieces = (text: string, pieces: Piece[]): Piece[] =>
  pieces.reduce<Piece[]>((joined, piece) => {
    const previous = joined[joined.length - 1];
    const canJoin =
      previous !== undefined &&
      !previous.isRange &&
      !piece.isRange &&
      previous.unit !== null &&
      getUnitRank(piece) > getUnitRank(previous) &&
      JOINER.test(text.slice(previous.end, piece.index));
    return canJoin
      ? [
          ...joined.slice(0, -1),
          {
            ...previous,
            end: piece.end,
            text: text.slice(previous.index, piece.end),
            unit: piece.unit,
            seconds: previous.seconds + piece.seconds,
          },
        ]
      : [...joined, piece];
  }, []);

/** The lengths of time a text mentions ("25 minutes", "1 hr 30 min", "10-15 min"), in order and without repeats. A range gives its longer end; over a day, or past the first 5,000 characters, is ignored. */
export function findDurations(fullText: string): FoundDuration[] {
  const text = fullText.slice(0, MAX_TEXT_CHARS);
  const pieces = [...getQuantityPieces(text), ...getSpokenPieces(text)].sort(
    (a, b) => a.index - b.index,
  );
  const seen = new Set<number>();
  const result = joinPieces(text, pieces)
    .filter(
      (piece) => piece.seconds > 0 && piece.seconds <= MAX_DURATION_SECONDS,
    )
    .filter((piece) => {
      if (seen.has(piece.seconds)) return false;
      seen.add(piece.seconds);
      return true;
    })
    .map(({ seconds, text: found }) => ({ seconds, text: found }));
  return result;
}

/** "25 min", "1 h 30 min", "45 sec". */
export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const parts = [
    hours > 0 && `${hours} h`,
    minutes > 0 && `${minutes} min`,
    seconds > 0 && `${seconds} sec`,
  ].filter(Boolean);
  return parts.length === 0 ? '0 sec' : parts.join(' ');
}

/** What a countdown shows for the time left: "25:00", "0:05", "1:30:00". Rounds up, so it reads 0:00 only once the time is up. */
export function formatClock(milliseconds: number): string {
  const total = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}

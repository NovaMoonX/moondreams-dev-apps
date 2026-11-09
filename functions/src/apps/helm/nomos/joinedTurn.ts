import type { CaptureReading, Token } from './commands.js';

export interface JoinedMessage {
  text: string;
  reading: CaptureReading;
}

export const withoutAddress = (text: string, reading: CaptureReading) => {
  const address = reading.addressedAs;
  if (!address) return text;
  return text.slice(address.end).replace(/^\s*,\s*/, '');
};

/** Several messages sent in a row as one: their text, one reading over the combined text, and each message's own words. */
export function combineMessages(messages: JoinedMessage[]): {
  text: string;
  reading: CaptureReading;
  texts: string[];
} {
  const isSingle = messages.length === 1;
  const offsets = messages.reduce<number[]>(
    (all, _message, index) => [
      ...all,
      index === 0 ? 0 : all[index - 1] + messages[index - 1].text.length + 1,
    ],
    [],
  );
  const shift = <T extends Token>(token: T, index: number): T =>
    isSingle
      ? token
      : {
          ...token,
          start: token.start + offsets[index],
          end: token.end + offsets[index],
        };
  const gather = (pick: (reading: CaptureReading) => Token[]) =>
    messages.flatMap((message, index) =>
      pick(message.reading).map((token) => shift(token, index)),
    );
  const first = messages[0].reading;
  return {
    text: messages.map((message) => message.text).join('\n'),
    reading: {
      people: gather((reading) => reading.people),
      places: gather((reading) => reading.places),
      documents: gather((reading) => reading.documents),
      commands: gather((reading) => reading.commands),
      isUrgent: messages.every((message) => message.reading.isUrgent),
      dates: messages.flatMap((message, index) =>
        message.reading.dates.map((span) => ({
          ...shift(span, index),
          id: isSingle ? span.id : `m${index + 1}.${span.id}`,
        })),
      ),
      addressedAs: first.addressedAs,
    },
    texts: messages.map((message) =>
      withoutAddress(message.text, message.reading),
    ),
  };
}

export interface JoinedRead {
  ids: string[];
  joinedCount: number;
}

/** Runs once over the messages read; when another joins mid-run (`onGrow`), that run is aborted and one more run reads them all and is left to finish. */
export async function interpretWithJoins<
  Read extends JoinedRead,
  Out extends { endedBy: string },
>(input: {
  readJoined: () => Promise<Read>;
  run: (read: Read, signal: AbortSignal) => Promise<Out>;
  watchJoins: (readCount: number, onGrow: () => void) => () => void;
}): Promise<{ read: Read; result: Out }> {
  const attempt = async (read: Read, isWatched: boolean) => {
    const controller = new AbortController();
    const stop = isWatched
      ? input.watchJoins(read.joinedCount, () => controller.abort())
      : () => undefined;
    try {
      return await input.run(read, controller.signal);
    } finally {
      stop();
    }
  };
  const first = await input.readJoined();
  const firstResult = await attempt(first, true);
  if (firstResult.endedBy !== 'aborted') {
    return { read: first, result: firstResult };
  }
  const second = await input.readJoined();
  return { read: second, result: await attempt(second, false) };
}

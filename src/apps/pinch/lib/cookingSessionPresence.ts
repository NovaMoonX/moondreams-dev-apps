const CHANNEL_NAME = 'pinch-cooking-session';
const ASK_WINDOW_MS = 400;

type Message = { type: 'ask' } | { type: 'live'; sessionId: string };

const open = () =>
  typeof BroadcastChannel === 'undefined'
    ? null
    : new BroadcastChannel(CHANNEL_NAME);

/** Answers other tabs that ask which cooking session is open here, so a second tab doesn't offer to pick up a session that is still running. */
export const announceCookingSession = (sessionId: string) => {
  const channel = open();
  if (channel === null) return undefined;
  const reply: Message = { type: 'live', sessionId };
  channel.onmessage = (event: MessageEvent<Message>) => {
    if (event.data.type === 'ask') channel.postMessage(reply);
  };
  return () => channel.close();
};

/** Asks the other tabs and reports whether `sessionId` answered within a moment; the answer comes once, and the returned function stops waiting. */
export const askIfCookingSessionLive = (
  sessionId: string,
  onAnswer: (isLive: boolean) => void,
) => {
  const channel = open();
  if (channel === null) {
    const timeoutId = window.setTimeout(() => onAnswer(false), 0);
    return () => window.clearTimeout(timeoutId);
  }
  const state = { isLive: false };
  channel.onmessage = (event: MessageEvent<Message>) => {
    if (event.data.type === 'live' && event.data.sessionId === sessionId) {
      state.isLive = true;
    }
  };
  channel.postMessage({ type: 'ask' } satisfies Message);
  const timeoutId = window.setTimeout(() => {
    channel.close();
    onAnswer(state.isLive);
  }, ASK_WINDOW_MS);
  return () => {
    window.clearTimeout(timeoutId);
    channel.close();
  };
};

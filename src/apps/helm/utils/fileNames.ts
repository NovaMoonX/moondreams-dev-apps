const TAIL_CHARS = 8;

/** A file name cut in the middle when it is longer than `max`, so its ending (the extension) stays visible. */
export const shortenFileName = (name: string, max = 28) =>
  name.length <= max
    ? name
    : `${name.slice(0, Math.max(1, max - TAIL_CHARS - 1)).trimEnd()}…${name.slice(-TAIL_CHARS)}`;

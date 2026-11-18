let liveDayKey: string | null = null;

/** The day whose aims the morning question in home's thread is asking for, or null while it isn't live. A turn sent while it is live may be the answer. */
export const setLiveAimsDay = (dayKey: string | null) => {
  liveDayKey = dayKey;
};

/** Hands the live day to the one turn being sent and clears it, so a second send before the thread catches up never carries it. */
export const takeLiveAimsDay = () => {
  const dayKey = liveDayKey;
  liveDayKey = null;
  return dayKey;
};

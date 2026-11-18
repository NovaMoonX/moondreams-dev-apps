let liveDayKey: string | null = null;

/** The day whose aims the morning question in home's thread is asking for, or null while it isn't live. A turn sent while it is live is the answer. */
export const setLiveAimsDay = (dayKey: string | null) => {
  liveDayKey = dayKey;
};

export const getLiveAimsDay = () => liveDayKey;

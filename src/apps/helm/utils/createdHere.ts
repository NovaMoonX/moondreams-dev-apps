const ids = new Set<string>();

/** Remembers a record this device made, for this session only. */
export const markCreatedHere = (id: string) => void ids.add(id);

export const wasCreatedHere = (id: string) => ids.has(id);

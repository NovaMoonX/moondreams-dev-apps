const holders = new Set<symbol>();

/** Marks that a form on this page holds typed work until the returned release is called. */
export function holdUnsavedWork() {
  const holder = Symbol('unsaved-work');
  holders.add(holder);
  return () => {
    holders.delete(holder);
  };
}

export function hasUnsavedWork() {
  return holders.size > 0;
}

/** Where a form hands what it built when the person has no plan to write to yet. */
export interface DraftSink<T> {
  /** A saved answer to change; null starts a new one. */
  initial: T | null;
  onSave: (value: T) => void;
  /** The income sources entered so far, which "From a paycheck" offers in place of a plan's pay days. */
  sources?: { id: string; name: string }[];
  /** A question to open first on a saved answer, for the one it still lacks. */
  openStep?: string | null;
  /** A line under a bill's repeat question, such as the words a document used for it. */
  repeatNote?: string | null;
}

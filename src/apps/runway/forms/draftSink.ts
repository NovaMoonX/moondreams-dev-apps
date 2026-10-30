/** Where a form hands what it built when the person has no plan to write to yet. */
export interface DraftSink<T> {
  /** A saved answer to change; null starts a new one. */
  initial: T | null;
  onSave: (value: T, forName?: string | null) => void;
  /** What a bill or envelope is for, asked only when given: the names the review already uses and this one's own. */
  forName?: { names: string[]; current: string | null };
  /** The income sources entered so far, which "From a paycheck" offers in place of a plan's pay days. */
  sources?: { id: string; name: string }[];
  /** A question to open first on a saved answer, for the one it still lacks. */
  openStep?: string | null;
  /** A line under a bill's repeat question and its amount, such as what a document said for a repeat the app lacks; may hold a figure. */
  repeatNote?: string | null;
}

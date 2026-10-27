/** Where a form hands what it built when the person has no plan to write to yet. */
export interface DraftSink<T> {
  /** A saved answer to change; null starts a new one. */
  initial: T | null;
  onSave: (value: T) => void;
}

/** A file's size in units a person reads: whole KB below a megabyte (never "0 KB" for a file with something in it), MB with one decimal from there. */
export function formatFileSize(bytes: number) {
  const kilobytes = Math.round(bytes / 1024);

  return kilobytes < 1024
    ? `${Math.max(1, kilobytes)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

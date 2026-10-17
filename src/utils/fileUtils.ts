/** A file's size in units a person reads: whole KB below a megabyte (never "0 KB" for a file with something in it), MB with one decimal from there. */
export function formatFileSize(bytes: number) {
  const kilobytes = Math.round(bytes / 1024);

  return kilobytes < 1024
    ? `${Math.max(1, kilobytes)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const READABLE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'heic',
  'heif',
  'gif',
  'pdf',
]);

/** Whether a picked or dropped file is a photo, screenshot or PDF: by its type, or by its extension when the browser left the type empty (HEIC often is). */
export function isReadableFile({ name, type }: { name: string; type: string }) {
  if (type !== '') {
    return type === 'application/pdf' || type.startsWith('image/');
  }

  const extension = /\.([^.]+)$/.exec(name)?.[1].toLowerCase() ?? '';
  const result = READABLE_EXTENSIONS.has(extension);
  return result;
}

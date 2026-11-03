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

/** Whether this browser can hand these files to its share sheet (false on most desktops). */
export function canShareFiles(files: File[]) {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files })
  );
}

/** Hands files to the share sheet where the browser has one, otherwise downloads each. Call it inside the tap with files already in hand: a share started after a slow `await` is refused on iOS. A cancelled share is not a failure. */
export async function shareOrDownloadFiles(
  files: File[],
  { title }: { title: string },
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (canShareFiles(files)) {
    try {
      await navigator.share({ files, title });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError')
        return 'cancelled';
      throw error;
    }
  }

  files.forEach((file) => {
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  });
  return 'downloaded';
}

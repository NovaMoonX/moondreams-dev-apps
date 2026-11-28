import { clearFallback, reportFallback } from '@/lib/fallbacks/fallbacks';

const SHARE_FALLBACK_KEY = 'file-share';

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

/** Whether these files go to a share sheet: a touch device whose browser can share them. A computer downloads instead, since the person needs the file on disk. */
export function canShareFiles(files: File[]) {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches &&
    navigator.canShare({ files })
  );
}

const describeError = (error: unknown) =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);

function downloadFiles(files: File[]) {
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
}

/** Hands files to the share sheet on a touch device that has one, otherwise downloads each; a refused share downloads too and is reported as a fallback. Call it inside the tap with files already in hand: a share started after a slow `await` is refused on iOS. A cancelled share is not a failure. */
export async function shareOrDownloadFiles(
  files: File[],
  { title }: { title: string },
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (canShareFiles(files)) {
    try {
      await navigator.share({ files, title });
      clearFallback(SHARE_FALLBACK_KEY);
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError')
        return 'cancelled';
      reportFallback({
        key: SHARE_FALLBACK_KEY,
        feature: 'Saving files',
        wanted: 'the share sheet',
        used: 'a download',
        reason: 'The browser refused to share these files.',
        cause: { stage: 'navigator.share', detail: describeError(error) },
        facts: [
          `Files: ${files.map((file) => `${file.name} (${file.type || 'no type'}, ${file.size} bytes)`).join('; ')}`,
          `User agent: ${navigator.userAgent}`,
        ],
        trace: error instanceof Error ? (error.stack ?? null) : null,
      });
    }
  }

  downloadFiles(files);
  return 'downloaded';
}

/** Opens a file input's chooser, or the phone's rear camera when `isCamera` (the input's `capture`), so one input serves both buttons. */
export function openFileChooser(input: HTMLInputElement | null, { isCamera = false } = {}) {
  if (!input) return;
  if (isCamera) input.setAttribute('capture', 'environment');
  else input.removeAttribute('capture');
  input.click();
}

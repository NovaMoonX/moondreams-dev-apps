const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

/** The MIME type to send with a picked file: its own, or one read from the extension when the browser left it empty (HEIC often is). */
export function getUploadMimeType(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const result = file.type || MIME_BY_EXTENSION[extension] || 'application/octet-stream';
  return result;
}

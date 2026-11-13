import { logger } from 'firebase-functions';
import { extractText, getDocumentProxy } from 'unpdf';

export type PdfReading =
  | { status: 'ok'; text: string; pageCount: number; hasTextLayer: boolean }
  | { status: 'locked' }
  | { status: 'tooManyPages'; pageCount: number }
  | { status: 'unreadable' };

const MIN_CHARS_PER_PAGE = 20;

const squash = (text: string) =>
  text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v\u00a0]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** Reads a PDF's text and page count; a password-protected file, one past `maxPages` and one that cannot be parsed each get their own status. */
export async function readPdf(
  bytes: Uint8Array,
  { maxPages }: { maxPages: number },
): Promise<PdfReading> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes), {
      verbosity: 0,
    });
    if (pdf.numPages > maxPages) {
      return { status: 'tooManyPages', pageCount: pdf.numPages };
    }
    const { text } = await extractText(pdf, { mergePages: true });
    const squashed = squash(text);
    return {
      status: 'ok',
      text: squashed,
      pageCount: pdf.numPages,
      hasTextLayer: squashed.length >= MIN_CHARS_PER_PAGE * pdf.numPages,
    };
  } catch (error) {
    const name = error instanceof Error ? error.name : 'unknown';
    logger.warn('files.pdfUnreadable', { error: name });
    return name === 'PasswordException'
      ? { status: 'locked' }
      : { status: 'unreadable' };
  }
}

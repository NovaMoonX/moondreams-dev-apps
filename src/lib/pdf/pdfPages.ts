export type PdfMeasure =
  | { status: 'ok'; pageCount: number }
  | { status: 'locked' }
  | { status: 'unreadable' };

/** Counts a PDF's pages on this device. The PDF reader loads only when this is called. */
export async function measurePdf(bytes: Uint8Array): Promise<PdfMeasure> {
  try {
    const { getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(bytes.slice(), { verbosity: 0 });
    return { status: 'ok', pageCount: pdf.numPages };
  } catch (error) {
    return (error as { name?: string }).name === 'PasswordException'
      ? { status: 'locked' }
      : { status: 'unreadable' };
  }
}

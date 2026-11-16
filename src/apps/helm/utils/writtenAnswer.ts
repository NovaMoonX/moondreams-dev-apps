import { extractLinks, normalizeProse } from '@/utils/proseUtils';
import type { CaptureAnswer, SyncedRecord } from '@apps/helm/types';

/** A stored written answer made safe to draw as Markdown: structure kept, and only the links in `links` stay. */
export function readWrittenAnswer(
  text: string,
  links: ReadonlySet<string>,
): string {
  return normalizeProse(text, Infinity, [...links]) ?? '';
}

/** The web addresses an answer may link to: those its cited quotes open and those written in the records it cites, never what a quote says (a mail or document can hold any address). */
export function readAnswerLinks(
  answer: Pick<CaptureAnswer, 'quotes' | 'sources'>,
  synced: readonly SyncedRecord[],
): Set<string> {
  const cited = new Set(
    answer.sources.flatMap((source) =>
      source.kind === 'synced' ? [source.id] : [],
    ),
  );
  return new Set([
    ...answer.quotes.flatMap((quote) =>
      quote.deepLink ? [quote.deepLink] : [],
    ),
    ...extractLinks(
      synced
        .filter((record) => cited.has(record.id))
        .flatMap(({ sealed }) => [
          sealed.title,
          sealed.subtitle ?? '',
          sealed.detail ?? '',
          sealed.placeLabel ?? '',
          ...Object.values(sealed.extra).map(String),
        ]),
    ),
  ]);
}

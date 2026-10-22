import { getWebLinkHost } from '@/utils/urlUtils';
import { clipAtWord } from '@/utils/stringUtils';
import { CATALOG_STORES } from '@apps/pinch/catalog/catalogStores';
import {
  MAX_NAME_LENGTH,
  MAX_PRICE_CENTS,
  MAX_SERVING_AMOUNT,
  UNITS,
} from '@apps/pinch/constants';
import type { Store, Unit } from '@apps/pinch/types';

/** What the reader found on a product page; it only fills the form. */
export interface ExtractedProduct {
  label: string | null;
  priceCents: number | null;
  sizeAmount: number | null;
  sizeUnit: Unit | null;
  unread: string[];
}

const MAX_UNREAD = 5;
const MAX_UNREAD_LENGTH = 160;

const asString = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

const asCents = (value: unknown) => {
  const cents = typeof value === 'number' ? Math.round(value * 100) : NaN;
  const result =
    Number.isFinite(cents) && cents > 0 && cents <= MAX_PRICE_CENTS
      ? cents
      : null;
  return result;
};

const asSize = (value: unknown) =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value > 0 &&
  value <= MAX_SERVING_AMOUNT
    ? value
    : null;

const asUnit = (value: unknown) =>
  typeof value === 'string' && UNITS.includes(value as Unit)
    ? (value as Unit)
    : null;

/** The reader's answer cleaned to what the form accepts: a size counts only with a known unit. */
export function normalizeExtractedProduct(raw: unknown): ExtractedProduct {
  const data =
    typeof raw === 'object' && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  const label = asString(data.brand);
  const size = asSize(data.sizeAmount);
  const unit = asUnit(data.sizeUnit);
  const hasSize = size !== null && unit !== null;
  const unread = Array.isArray(data.unread)
    ? data.unread
        .map(asString)
        .filter((note) => note !== null)
        .slice(0, MAX_UNREAD)
        .map((note) => clipAtWord(note, MAX_UNREAD_LENGTH))
    : [];

  const result: ExtractedProduct = {
    label: label === null ? null : clipAtWord(label, MAX_NAME_LENGTH),
    priceCents: asCents(data.price),
    sizeAmount: hasSize ? size : null,
    sizeUnit: hasSize ? unit : null,
    unread,
  };
  return result;
}

const isOnDomain = (host: string, domain: string) =>
  host === domain || host.endsWith(`.${domain}`);

export interface StoreForLink {
  storeId: string | null;
  suggestedName: string | null;
}

/** Which of the person's stores a product page is on; a well-known store they haven't added is only named, never added. */
export function findStoreForLink(link: string, stores: Store[]): StoreForLink {
  const host = getWebLinkHost(link);
  const catalogStore =
    host === null
      ? null
      : (CATALOG_STORES.find((candidate) =>
          isOnDomain(host, candidate.domain),
        ) ?? null);
  if (catalogStore === null) {
    return { storeId: null, suggestedName: null };
  }

  const own = stores.find(
    (store) => store.catalogStoreId === catalogStore.id && !store.isArchived,
  );
  return own
    ? { storeId: own.id, suggestedName: null }
    : { storeId: null, suggestedName: catalogStore.name };
}

// A function can't import src/apps/going-once/constants.ts, so the caps and lists are repeated here; scripts/checks/goingOnceShare.ts fails when they drift.
export const SALE_PAGE_LIMITS = {
  MAX_SALE_NAME_LENGTH: 80,
  MAX_PICKUP_AREA_LENGTH: 80,
  MAX_BUYER_NOTE_LENGTH: 300,
  MAX_ITEM_TITLE_LENGTH: 120,
  MAX_ITEM_DESCRIPTION_LENGTH: 2000,
  MAX_ITEM_BRAND_LENGTH: 80,
  MAX_ITEM_SIZE_LENGTH: 80,
  MAX_PAGE_THINGS: 300,
} as const;

export const PUBLIC_CONDITIONS = [
  'NEW',
  'LIKE_NEW',
  'GOOD',
  'FAIR',
  'WELL_USED',
] as const;

/** Only a thing buyers can still ask about is served; Sold and taken-off things never leave. */
export const FINISHED_SALE_STATUS = 'FINISHED';

export const PUBLIC_STATUSES = ['AVAILABLE', 'PENDING'] as const;

export type PublicCondition = (typeof PUBLIC_CONDITIONS)[number];
export type PublicStatus = (typeof PUBLIC_STATUSES)[number];

export interface PublicSale {
  name: string;
  pickupArea: string | null;
  buyerNote: string | null;
}

export interface PublicThing {
  id: string;
  title: string;
  description: string | null;
  brandModel: string | null;
  size: string | null;
  condition: PublicCondition | null;
  askingPriceCents: number;
  originalPriceCents: number | null;
  status: PublicStatus;
}

export type SalePageResult =
  | { status: 'not_found' }
  | {
      status: 'ok';
      sale: PublicSale;
      things: PublicThing[];
      isMember: boolean;
    };

export const NOT_FOUND_RESULT: SalePageResult = { status: 'not_found' };

const LINK_ID_PATTERN = /^[2-9a-hj-np-z]{26}$/;
const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_CENTS = 10_000_000_000;

export const isLinkId = (value: unknown): value is string =>
  typeof value === 'string' && LINK_ID_PATTERN.test(value);

export const isSafeId = (value: unknown): value is string =>
  typeof value === 'string' && SAFE_ID_PATTERN.test(value);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A thing buyers can be shown needs a photo, a name and a price; Free counts as a price. */
export function isListable(item: unknown): boolean {
  if (!isRecord(item)) {
    return false;
  }

  return (
    Array.isArray(item.photos) &&
    item.photos.length > 0 &&
    typeof item.title === 'string' &&
    item.title.trim() !== '' &&
    typeof item.askingPriceCents === 'number'
  );
}

const toText = (value: unknown, max: number) => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim().slice(0, max);
  return trimmed === '' ? null : trimmed;
};

const toCents = (value: unknown) =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= MAX_CENTS
    ? value
    : null;

const toCondition = (value: unknown): PublicCondition | null =>
  PUBLIC_CONDITIONS.find((condition) => condition === value) ?? null;

const toStatus = (value: unknown): PublicStatus | null =>
  PUBLIC_STATUSES.find((status) => status === value) ?? null;

/** Copies the sale's public fields by name; null when it has no name to show. */
export function toPublicSale(raw: unknown): PublicSale | null {
  if (!isRecord(raw)) {
    return null;
  }

  const name = toText(raw.name, SALE_PAGE_LIMITS.MAX_SALE_NAME_LENGTH);
  return name === null
    ? null
    : {
        name,
        pickupArea: toText(
          raw.pickupArea,
          SALE_PAGE_LIMITS.MAX_PICKUP_AREA_LENGTH,
        ),
        buyerNote: toText(
          raw.buyerNote,
          SALE_PAGE_LIMITS.MAX_BUYER_NOTE_LENGTH,
        ),
      };
}

/**
 * Copies a stored thing's public fields by name into a new object; null when it is not showing (not Available or Pending, not listable) or its id is not a plain key.
 * The original price leaves only when the seller chose to show it.
 */
export function toPublicThing(raw: unknown): PublicThing | null {
  if (!isRecord(raw)) {
    return null;
  }

  const status = toStatus(raw.status);
  const title = toText(raw.title, SALE_PAGE_LIMITS.MAX_ITEM_TITLE_LENGTH);
  const askingPriceCents = toCents(raw.askingPriceCents);
  if (
    status === null ||
    title === null ||
    askingPriceCents === null ||
    !isSafeId(raw.id) ||
    !isListable(raw)
  ) {
    return null;
  }

  return {
    id: raw.id,
    title,
    description: toText(
      raw.description,
      SALE_PAGE_LIMITS.MAX_ITEM_DESCRIPTION_LENGTH,
    ),
    brandModel: toText(raw.brandModel, SALE_PAGE_LIMITS.MAX_ITEM_BRAND_LENGTH),
    size: toText(raw.size, SALE_PAGE_LIMITS.MAX_ITEM_SIZE_LENGTH),
    condition: toCondition(raw.condition),
    askingPriceCents,
    originalPriceCents:
      raw.showOriginalPrice === true ? toCents(raw.originalPriceCents) : null,
    status,
  };
}

/** Available things first, then Pending ones, each group in the order given. */
export const orderThings = (things: PublicThing[]) => [
  ...things.filter((thing) => thing.status === 'AVAILABLE'),
  ...things.filter((thing) => thing.status === 'PENDING'),
];

/** The final pass: every field of the answer is copied by name once more, so nothing a later edit adds to a shaped object can leave. */
export function sealPage(page: SalePageResult): SalePageResult {
  if (page.status !== 'ok') {
    return NOT_FOUND_RESULT;
  }

  const sale = toPublicSale(page.sale);
  if (sale === null) {
    return NOT_FOUND_RESULT;
  }

  const things = page.things.flatMap((thing) => {
    const status = toStatus(thing.status);
    const title = toText(thing.title, SALE_PAGE_LIMITS.MAX_ITEM_TITLE_LENGTH);
    const askingPriceCents = toCents(thing.askingPriceCents);
    if (status === null || title === null || askingPriceCents === null) {
      return [];
    }

    const sealed: PublicThing = {
      id: thing.id,
      title,
      description: toText(
        thing.description,
        SALE_PAGE_LIMITS.MAX_ITEM_DESCRIPTION_LENGTH,
      ),
      brandModel: toText(
        thing.brandModel,
        SALE_PAGE_LIMITS.MAX_ITEM_BRAND_LENGTH,
      ),
      size: toText(thing.size, SALE_PAGE_LIMITS.MAX_ITEM_SIZE_LENGTH),
      condition: toCondition(thing.condition),
      askingPriceCents,
      originalPriceCents: toCents(thing.originalPriceCents),
      status,
    };
    return isSafeId(sealed.id) ? [sealed] : [];
  });
  return {
    status: 'ok',
    sale,
    things: orderThings(things).slice(0, SALE_PAGE_LIMITS.MAX_PAGE_THINGS),
    isMember: page.isMember === true,
  };
}

/** The page a link shows: the sale's public fields and its showing things, ready to send. */
export function toSalePage(
  sale: unknown,
  items: unknown[],
  isMember: boolean,
): SalePageResult {
  const publicSale = toPublicSale(sale);
  if (publicSale === null) {
    return NOT_FOUND_RESULT;
  }

  const things = items.flatMap((item) => {
    const thing = toPublicThing(item);
    return thing === null ? [] : [thing];
  });
  return sealPage({
    status: 'ok',
    sale: publicSale,
    things: orderThings(things).slice(0, SALE_PAGE_LIMITS.MAX_PAGE_THINGS),
    isMember,
  });
}

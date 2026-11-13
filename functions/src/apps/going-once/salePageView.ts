// A function can't import src/apps/going-once/constants.ts, so the caps and lists are repeated here; scripts/checks/goingOnceShare.ts fails when they drift.
export const SALE_PAGE_LIMITS = {
  MAX_SALE_NAME_LENGTH: 80,
  MAX_PICKUP_AREA_LENGTH: 80,
  MAX_BUYER_NOTE_LENGTH: 300,
  MAX_ITEM_TITLE_LENGTH: 120,
  MAX_ITEM_DESCRIPTION_LENGTH: 2000,
  MAX_ITEM_BRAND_LENGTH: 80,
  MAX_ITEM_SIZE_LENGTH: 80,
  MAX_PAYMENT_METHODS: 8,
  MAX_PAYMENT_METHOD_LENGTH: 30,
  MAX_STORE_URL_LENGTH: 2000,
  MAX_PAGE_THINGS: 300,
  MAX_BUNDLE_NAME_LENGTH: 60,
  MAX_PAGE_BUNDLES: 100,
} as const;

const BUNDLE_STATUSES = ['ACTIVE', 'PENDING'] as const;

export const PUBLIC_CONDITIONS = [
  'NEW',
  'LIKE_NEW',
  'GOOD',
  'FAIR',
  'WELL_USED',
] as const;

export const FINISHED_SALE_STATUS = 'FINISHED';

/** Only a thing buyers can still ask about is served; Sold and taken-off things never leave. */
export const PUBLIC_STATUSES = ['AVAILABLE', 'PENDING'] as const;

/** The two sizes of public copy, the longest side of each in pixels. */
export const COPY_SIZES = { s: 480, m: 1280 } as const;

export type CopySize = keyof typeof COPY_SIZES;

export const COPY_SIZE_KEYS = Object.keys(COPY_SIZES) as CopySize[];

/** The most photos of one thing that get copies. */
export const MAX_COPIED_PHOTOS = 12;

/** The folder of a link's public photo copies. */
export const publicFolder = (linkId: string) =>
  `apps/going-once/public/${linkId}/`;

export const publicCopyPath = (
  linkId: string,
  itemId: string,
  photoId: string,
  size: CopySize,
) => `${publicFolder(linkId)}${itemId}/${photoId}-${size}.webp`;

export type PublicCondition = (typeof PUBLIC_CONDITIONS)[number];
export type PublicStatus = (typeof PUBLIC_STATUSES)[number];

export interface PublicSale {
  name: string;
  pickupArea: string | null;
  buyerNote: string | null;
  paymentMethods: string[];
}

/** One photo's two copies, as Storage paths. */
export interface PublicPhoto {
  s: string;
  m: string;
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
  storeUrl: string | null;
  status: PublicStatus;
  bundleId: string | null;
  isBundleOnly: boolean;
  photos: PublicPhoto[];
}

export interface PublicBundle {
  id: string;
  name: string;
  priceCents: number;
  separateCents: number;
  thingIds: string[];
  goneCount: number;
  status: PublicStatus;
}

export type SalePageResult =
  | { status: 'not_found' }
  | {
      status: 'ok';
      sale: PublicSale;
      things: PublicThing[];
      bundles: PublicBundle[];
      isMember: boolean;
    };

export const NOT_FOUND_RESULT: SalePageResult = { status: 'not_found' };

const LINK_ID_PATTERN = /^[2-9a-hj-np-z]{26}$/;
const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const PHOTO_ID_PATTERN = /^[A-Za-z0-9-]{8,40}$/;
const COPY_PATH_PATTERN =
  /^apps\/going-once\/public\/([2-9a-hj-np-z]{26})\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9-]{8,40})-(s|m)\.webp$/;
const MAX_CENTS = 10_000_000_000;

export const isLinkId = (value: unknown): value is string =>
  typeof value === 'string' && LINK_ID_PATTERN.test(value);

export const isSafeId = (value: unknown): value is string =>
  typeof value === 'string' && SAFE_ID_PATTERN.test(value);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A thing buyers can be shown is not a draft (a thing from before drafts has no field and is not one) and has a photo, a name and a price; Free counts as a price. */
export function isListable(item: unknown): boolean {
  if (!isRecord(item)) {
    return false;
  }

  return (
    item.isDraft !== true &&
    Array.isArray(item.photos) &&
    item.photos.length > 0 &&
    typeof item.title === 'string' &&
    item.title.trim() !== '' &&
    typeof item.askingPriceCents === 'number'
  );
}

/** The first photos of a stored thing that can have copies: a plain id, and a file inside the thing's own folder. */
export function readCopyablePhotos(
  saleId: string,
  itemId: string,
  item: unknown,
): { id: string; path: string }[] {
  if (!isRecord(item) || item.id !== itemId) {
    return [];
  }

  const folder = `apps/going-once/sales/${saleId}/items/${itemId}/`;
  const stored: unknown[] = Array.isArray(item.photos) ? item.photos : [];
  return stored
    .slice(0, MAX_COPIED_PHOTOS)
    .flatMap((photo) =>
      isRecord(photo) &&
      typeof photo.id === 'string' &&
      PHOTO_ID_PATTERN.test(photo.id) &&
      typeof photo.path === 'string' &&
      photo.path.startsWith(folder) &&
      !photo.path.slice(folder.length).includes('/')
        ? [{ id: photo.id, path: photo.path }]
        : [],
    );
}

/** What a link's folder holds, so a page names only copies that exist. */
export interface CopyListing {
  saleId: string;
  linkId: string;
  paths: ReadonlySet<string>;
}

/** A thing's photos in its own order, each only once both of its copies exist; never the listing-size path. */
export function toPublicPhotos(
  raw: unknown,
  listing: CopyListing | null,
): PublicPhoto[] {
  if (listing === null || !isRecord(raw) || !isSafeId(raw.id)) {
    return [];
  }

  const itemId = raw.id;
  return readCopyablePhotos(listing.saleId, itemId, raw).flatMap((photo) => {
    const s = publicCopyPath(listing.linkId, itemId, photo.id, 's');
    const m = publicCopyPath(listing.linkId, itemId, photo.id, 'm');
    return listing.paths.has(s) && listing.paths.has(m) ? [{ s, m }] : [];
  });
}

const toText = (value: unknown, max: number) => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim().slice(0, max);
  return trimmed === '' ? null : trimmed;
};

const toPaymentMethods = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .flatMap((method: unknown) => {
          const text = toText(
            method,
            SALE_PAGE_LIMITS.MAX_PAYMENT_METHOD_LENGTH,
          );
          return text === null ? [] : [text];
        })
        .slice(0, SALE_PAGE_LIMITS.MAX_PAYMENT_METHODS)
    : [];

/** The store's link as an http(s) address, or null; only a link the seller chose to show is passed in. */
const toStoreUrl = (value: unknown) => {
  if (
    typeof value !== 'string' ||
    value.length > SALE_PAGE_LIMITS.MAX_STORE_URL_LENGTH
  ) {
    return null;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    url.username = '';
    url.password = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
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
        paymentMethods: toPaymentMethods(raw.paymentMethods),
      };
}

/**
 * Copies a stored thing's public fields by name into a new object; null when it is not showing (not Available or Pending, not listable) or its id is not a plain key.
 * The original price and the store's link leave only when the seller chose to show them; the store's name, preview and date never do.
 */
export function toPublicThing(
  raw: unknown,
  listing: CopyListing | null = null,
): PublicThing | null {
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
    storeUrl: raw.showBoughtUrl === true ? toStoreUrl(raw.boughtUrl) : null,
    status,
    bundleId: null,
    isBundleOnly: false,
    photos: toPublicPhotos(raw, listing),
  };
}

/** Available things first, then Pending ones, each group in the order given. */
export const orderThings = (things: PublicThing[]) => [
  ...things.filter((thing) => thing.status === 'AVAILABLE'),
  ...things.filter((thing) => thing.status === 'PENDING'),
];

const toIdList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter(isSafeId) : [];

/** The ids of a bundle's deal in the bundle's order: Available things while it is Active, the held ones while it is Pending. */
export function readBundleDeal(
  bundle: unknown,
  itemsById: ReadonlyMap<string, unknown>,
): string[] {
  if (!isRecord(bundle)) {
    return [];
  }

  const dealIds = toIdList(bundle.dealItemIds);
  return [...new Set(toIdList(bundle.itemIds))].filter((id) => {
    const item = itemsById.get(id);
    if (!isRecord(item) || item.bundleId !== bundle.id) {
      return false;
    }

    return bundle.status === 'ACTIVE'
      ? item.status === 'AVAILABLE'
      : dealIds.includes(id);
  });
}

/** A bundle's public form from the things already shaped for the page; null unless two or more of its deal are among them. The price is clamped to what the things cost apart. */
function shapeBundle(
  bundle: {
    id: unknown;
    name: unknown;
    priceCents: unknown;
    status: unknown;
    thingIds: string[];
    goneCount: unknown;
  },
  things: PublicThing[],
): PublicBundle | null {
  const byId = new Map(things.map((thing) => [thing.id, thing]));
  const served = [...new Set(bundle.thingIds)].flatMap((id) => {
    const thing = byId.get(id);
    return thing === undefined ? [] : [thing];
  });
  const name = toText(bundle.name, SALE_PAGE_LIMITS.MAX_BUNDLE_NAME_LENGTH);
  const status = toStatus(bundle.status);
  const priceCents = toCents(bundle.priceCents);
  if (
    served.length < 2 ||
    name === null ||
    status === null ||
    priceCents === null ||
    !isSafeId(bundle.id)
  ) {
    return null;
  }

  const separateCents = served.reduce(
    (total, thing) => total + thing.askingPriceCents,
    0,
  );
  const goneCount =
    typeof bundle.goneCount === 'number' &&
    Number.isSafeInteger(bundle.goneCount)
      ? Math.max(0, Math.min(bundle.goneCount, 1000))
      : 0;
  return {
    id: bundle.id,
    name,
    priceCents: Math.max(0, Math.min(priceCents, separateCents)),
    separateCents,
    thingIds: served.map((thing) => thing.id),
    goneCount,
    status,
  };
}

/** The bundles a page serves and which of the page's things sit in one; a bundle shows only with two or more listable things in its deal, and `goneCount` is a count of the rest. */
export function toPublicBundles(
  rawBundles: unknown[],
  rawItems: unknown[],
  things: PublicThing[],
): {
  bundles: PublicBundle[];
  inBundle: Map<string, { bundleId: string; isBundleOnly: boolean }>;
} {
  const itemsById = new Map(
    rawItems.flatMap((item): [string, unknown][] =>
      isRecord(item) && isSafeId(item.id) ? [[item.id, item]] : [],
    ),
  );
  const shaped = rawBundles
    .slice(0, SALE_PAGE_LIMITS.MAX_PAGE_BUNDLES)
    .flatMap((raw) => {
      if (
        !isRecord(raw) ||
        !BUNDLE_STATUSES.some((status) => status === raw.status)
      ) {
        return [];
      }

      const bundle = shapeBundle(
        {
          id: raw.id,
          name: raw.name,
          priceCents: raw.priceCents,
          status: raw.status === 'PENDING' ? 'PENDING' : 'AVAILABLE',
          thingIds: readBundleDeal(raw, itemsById),
          goneCount: 0,
        },
        things,
      );
      return bundle === null
        ? []
        : [
            {
              bundle: {
                ...bundle,
                goneCount:
                  new Set(toIdList(raw.itemIds)).size - bundle.thingIds.length,
              },
              isActive: raw.status === 'ACTIVE',
            },
          ];
    });
  const ordered = [
    ...shaped.filter(({ bundle }) => bundle.status === 'AVAILABLE'),
    ...shaped.filter(({ bundle }) => bundle.status === 'PENDING'),
  ];
  const inBundle = ordered.reduce(
    (found, { bundle, isActive }) =>
      bundle.thingIds.reduce((inner, id) => {
        const stored = itemsById.get(id);
        return inner.has(id)
          ? inner
          : inner.set(id, {
              bundleId: bundle.id,
              isBundleOnly:
                isActive && isRecord(stored) && stored.isBundleOnly === true,
            });
      }, found),
    new Map<string, { bundleId: string; isBundleOnly: boolean }>(),
  );
  return {
    bundles: ordered.map(({ bundle }) => bundle),
    inBundle,
  };
}

const readCopyPath = (value: unknown) => {
  const match =
    typeof value === 'string' ? COPY_PATH_PATTERN.exec(value) : null;
  return match === null
    ? null
    : { linkId: match[1], itemId: match[2], photoId: match[3], size: match[4] };
};

/** A photo leaves only when both paths sit in this link's folder, under this thing, are the same photo, and `s` is the small size and `m` the large. */
const sealPhoto = (photo: unknown, linkId: string, itemId: string) => {
  const small = isRecord(photo) ? readCopyPath(photo.s) : null;
  const large = isRecord(photo) ? readCopyPath(photo.m) : null;
  return small !== null &&
    large !== null &&
    isRecord(photo) &&
    typeof photo.s === 'string' &&
    typeof photo.m === 'string' &&
    small.size === 's' &&
    large.size === 'm' &&
    small.linkId === linkId &&
    large.linkId === linkId &&
    small.itemId === itemId &&
    large.itemId === itemId &&
    small.photoId === large.photoId
    ? [{ s: photo.s, m: photo.m }]
    : [];
};

/**
 * The final pass: every field of the answer is copied by name once more, so nothing a later edit adds to a shaped object can leave.
 * `linkId` is the link the page was asked for; a photo path from any other link or thing is dropped.
 */
export function sealPage(
  page: SalePageResult,
  linkId: string | null,
): SalePageResult {
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
      storeUrl: toStoreUrl(thing.storeUrl),
      status,
      bundleId: isSafeId(thing.bundleId) ? thing.bundleId : null,
      isBundleOnly: thing.isBundleOnly === true && isSafeId(thing.bundleId),
      photos:
        linkId === null || !Array.isArray(thing.photos)
          ? []
          : thing.photos
              .slice(0, MAX_COPIED_PHOTOS)
              .flatMap((photo: unknown) => sealPhoto(photo, linkId, thing.id)),
    };
    return isSafeId(sealed.id) ? [sealed] : [];
  });
  const shown = orderThings(things).slice(0, SALE_PAGE_LIMITS.MAX_PAGE_THINGS);
  const bundles = (Array.isArray(page.bundles) ? page.bundles : [])
    .slice(0, SALE_PAGE_LIMITS.MAX_PAGE_BUNDLES)
    .flatMap((bundle) => {
      const sealed = isRecord(bundle)
        ? shapeBundle(
            {
              id: bundle.id,
              name: bundle.name,
              priceCents: bundle.priceCents,
              status: bundle.status,
              goneCount: bundle.goneCount,
              thingIds: toIdList(bundle.thingIds),
            },
            shown,
          )
        : null;
      return sealed === null ? [] : [sealed];
    });
  return {
    status: 'ok',
    sale,
    things: shown.map((thing) => {
      const bundle = bundles.find(
        (candidate) =>
          candidate.id === thing.bundleId &&
          candidate.thingIds.includes(thing.id),
      );
      return {
        ...thing,
        bundleId: bundle?.id ?? null,
        isBundleOnly: bundle !== undefined && thing.isBundleOnly,
      };
    }),
    bundles,
    isMember: page.isMember === true,
  };
}

/** The page a link shows: the sale's public fields and its showing things, ready to send. */
export function toSalePage(
  sale: unknown,
  items: unknown[],
  isMember: boolean,
  listing: CopyListing | null = null,
  bundles: unknown[] = [],
): SalePageResult {
  const publicSale = toPublicSale(sale);
  if (publicSale === null) {
    return NOT_FOUND_RESULT;
  }

  const listed = items.flatMap((item) => {
    const thing = toPublicThing(item, listing);
    return thing === null ? [] : [thing];
  });
  const served = toPublicBundles(bundles, items, listed);
  const things = listed.map((thing) => ({
    ...thing,
    ...(served.inBundle.get(thing.id) ?? {
      bundleId: null,
      isBundleOnly: false,
    }),
  }));
  return sealPage(
    {
      status: 'ok',
      sale: publicSale,
      things: orderThings(things).slice(0, SALE_PAGE_LIMITS.MAX_PAGE_THINGS),
      bundles: served.bundles,
      isMember,
    },
    listing?.linkId ?? null,
  );
}

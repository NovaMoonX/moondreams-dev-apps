import { useCallback, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { useAppSelector } from '@/store';
import { extractProductFromPage } from '@apps/pinch/lib/extractProduct';
import { productPageQueryOptions } from '@apps/pinch/queries/productPageQueries';
import { selectStores } from '@apps/pinch/store/selectors';
import {
  findStoreForLink,
  type ExtractedProduct,
  type StoreForLink,
} from '@apps/pinch/utils/normalizeProduct';
import {
  classifyReadFailure,
  getProductReadFailureLine,
} from '@apps/pinch/utils/readFailures';

export interface ReadState {
  isFilling: boolean;
  note: string | null;
  error: string | null;
}

export const IDLE_READING: ReadState = {
  isFilling: false,
  note: null,
  error: null,
};

export interface ProductReading {
  found: ExtractedProduct;
  match: StoreForLink;
}

const sentence = (parts: string[]) =>
  parts.length > 1
    ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
    : parts[0];

const getFilledNote = ({ found, match }: ProductReading, hasSize: boolean) => {
  const hasPrice = found.priceCents !== null;
  const filled = [
    match.storeId !== null && 'the store',
    hasPrice && 'the price',
    hasSize && 'the size',
    found.label !== null && 'the label',
  ].filter((part) => typeof part === 'string');
  const missing = [!hasPrice && 'the price', !hasSize && 'the size'].filter(
    (part) => typeof part === 'string',
  );
  const result = [
    `Filled in ${sentence(filled)}. Check them over.`,
    missing.length > 0 && `We couldn't find ${sentence(missing)}.`,
    match.storeId === null &&
      match.suggestedName !== null &&
      `${match.suggestedName} isn't one of your stores yet: pick it below.`,
  ]
    .filter((part) => typeof part === 'string')
    .join(' ');
  return result;
};

/** Reads a product page into a price, size, brand and store for a form to take; the caller applies it. */
export function useProductPageReading() {
  const queryClient = useQueryClient();
  const stores = useAppSelector(selectStores);
  const [reading, setReading] = useState<ReadState>(IDLE_READING);

  const reset = useCallback(() => setReading(IDLE_READING), []);

  const read = useCallback(
    async (pageLink: string): Promise<ProductReading | null> => {
      setReading({ isFilling: true, note: null, error: null });
      try {
        const page = await queryClient.fetchQuery(
          productPageQueryOptions(pageLink),
        );
        const found = await extractProductFromPage(page);
        const result = { found, match: findStoreForLink(pageLink, stores) };
        const hasSize = found.sizeAmount !== null && found.sizeUnit !== null;
        if (found.priceCents === null && !hasSize && found.label === null) {
          setReading({
            isFilling: false,
            note: null,
            error: getProductReadFailureLine('empty'),
          });
          return null;
        }

        setReading({
          isFilling: false,
          note: getFilledNote(result, hasSize),
          error: null,
        });
        return result;
      } catch (readError) {
        console.error('Reading a product page failed', readError);
        setReading({
          isFilling: false,
          note: null,
          error: getProductReadFailureLine(
            classifyReadFailure(readError, navigator.onLine),
          ),
        });
        return null;
      }
    },
    [queryClient, stores],
  );

  return { reading, read, reset };
}

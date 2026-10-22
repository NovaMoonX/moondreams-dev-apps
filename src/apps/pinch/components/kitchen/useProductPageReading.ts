import { useCallback, useRef, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { useAppSelector } from '@/store';
import { extractProductFromPage } from '@apps/pinch/lib/extractProduct';
import { productPageQueryOptions } from '@apps/pinch/queries/productPageQueries';
import {
  selectIngredientRecordsById,
  selectIngredientsById,
  selectStores,
} from '@apps/pinch/store/selectors';
import { MAX_INGREDIENT_ALIASES } from '@apps/pinch/constants';
import {
  getRecordAliases,
  isNameTaken,
} from '@apps/pinch/utils/ingredientRecord';
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

const getFilledNote = (
  { found, match }: ProductReading,
  hasSize: boolean,
  hasLabel: boolean,
) => {
  const hasPrice = found.priceCents !== null;
  const filled = [
    match.storeId !== null && 'the store',
    hasPrice && 'the price',
    hasSize && 'the size',
    hasLabel && found.label !== null && 'the label',
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

/** Reads a product page into a price, size, brand and store for a form to take; the caller applies it. A reading that lands after `reset` or a newer one is dropped (it returns null). */
export function useProductPageReading({ hasLabel = true } = {}) {
  const queryClient = useQueryClient();
  const stores = useAppSelector(selectStores);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const recordsById = useAppSelector(selectIngredientRecordsById);
  const [reading, setReading] = useState<ReadState>(IDLE_READING);

  const latestRequest = useRef(0);

  const reset = useCallback(() => {
    latestRequest.current += 1;
    setReading(IDLE_READING);
  }, []);

  const read = useCallback(
    async (
      pageLink: string,
      ingredient: { id: string; name: string; aliases: string[] },
    ): Promise<ProductReading | null> => {
      latestRequest.current += 1;
      const request = latestRequest.current;
      setReading({ isFilling: true, note: null, error: null });
      try {
        const page = await queryClient.fetchQuery(
          productPageQueryOptions(pageLink),
        );
        const raw = await extractProductFromPage(page, ingredient);
        const isAliasUsable =
          raw.alias !== null &&
          getRecordAliases(recordsById.get(ingredient.id) ?? null).length <
            MAX_INGREDIENT_ALIASES &&
          !isNameTaken(raw.alias, [...ingredientsById.values()], ingredient.id);
        const found = isAliasUsable ? raw : { ...raw, alias: null };
        if (request !== latestRequest.current) {
          return null;
        }
        const result = { found, match: findStoreForLink(pageLink, stores) };
        const hasSize = found.sizeAmount !== null && found.sizeUnit !== null;
        if (
          found.priceCents === null &&
          !hasSize &&
          !(hasLabel && found.label !== null)
        ) {
          setReading({
            isFilling: false,
            note: null,
            error: getProductReadFailureLine('empty'),
          });
          return null;
        }

        setReading({
          isFilling: false,
          note: getFilledNote(result, hasSize, hasLabel),
          error: null,
        });
        return result;
      } catch (readError) {
        console.error('Reading a product page failed', readError);
        if (request !== latestRequest.current) {
          return null;
        }
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
    [queryClient, stores, ingredientsById, recordsById, hasLabel],
  );

  return { reading, read, reset };
}

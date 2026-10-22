import { useCallback, useRef, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { useAppSelector } from '@/store';
import { isReadableFile } from '@/utils/fileUtils';
import {
  extractProductFromFile,
  extractProductFromPage,
} from '@apps/pinch/lib/extractProduct';
import { productPageQueryOptions } from '@apps/pinch/queries/productPageQueries';
import {
  selectIngredientRecordsById,
  selectIngredientsById,
  selectStores,
} from '@apps/pinch/store/selectors';
import {
  MAX_INGREDIENT_ALIASES,
  MAX_UPLOAD_BYTES,
} from '@apps/pinch/constants';
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
  canReadPictureInstead,
  classifyReadFailure,
  getProductReadFailureLine,
  type ReadFailure,
} from '@apps/pinch/utils/readFailures';

export interface ReadState {
  isFilling: boolean;
  note: string | null;
  error: string | null;
  /** The failure is one a screenshot or photo could get past. */
  canTryPicture: boolean;
}

export const IDLE_READING: ReadState = {
  isFilling: false,
  note: null,
  error: null,
  canTryPicture: false,
};

const NO_STORE: StoreForLink = { storeId: null, suggestedName: null };

const failed = (cause: ReadFailure, isPicture: boolean): ReadState => ({
  isFilling: false,
  note: null,
  error: getProductReadFailureLine(cause, isPicture),
  canTryPicture: canReadPictureInstead(cause),
});

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

  const run = useCallback(
    async (
      getRaw: () => Promise<ExtractedProduct>,
      getMatch: () => StoreForLink,
      ingredient: { id: string },
      isPicture: boolean,
    ): Promise<ProductReading | null> => {
      latestRequest.current += 1;
      const request = latestRequest.current;
      setReading({ ...IDLE_READING, isFilling: true });
      try {
        const raw = await getRaw();
        const isAliasUsable =
          raw.alias !== null &&
          getRecordAliases(recordsById.get(ingredient.id) ?? null).length <
            MAX_INGREDIENT_ALIASES &&
          !isNameTaken(raw.alias, [...ingredientsById.values()], ingredient.id);
        const found = isAliasUsable ? raw : { ...raw, alias: null };
        if (request !== latestRequest.current) {
          return null;
        }
        const result = { found, match: getMatch() };
        const hasSize = found.sizeAmount !== null && found.sizeUnit !== null;
        if (
          found.priceCents === null &&
          !hasSize &&
          !(hasLabel && found.label !== null)
        ) {
          setReading(failed('empty', isPicture));
          return null;
        }

        setReading({
          ...IDLE_READING,
          note: getFilledNote(result, hasSize, hasLabel),
        });
        return result;
      } catch (readError) {
        console.error('Reading a product failed', readError);
        if (request !== latestRequest.current) {
          return null;
        }
        setReading(
          failed(classifyReadFailure(readError, navigator.onLine), isPicture),
        );
        return null;
      }
    },
    [recordsById, ingredientsById, hasLabel],
  );

  const read = useCallback(
    (
      pageLink: string,
      ingredient: { id: string; name: string; aliases: string[] },
    ) =>
      run(
        async () =>
          extractProductFromPage(
            await queryClient.fetchQuery(productPageQueryOptions(pageLink)),
            ingredient,
          ),
        () => findStoreForLink(pageLink, stores),
        ingredient,
        false,
      ),
    [run, queryClient, stores],
  );

  const readFile = useCallback(
    async (
      file: File,
      ingredient: { id: string; name: string; aliases: string[] },
    ) => {
      if (!isReadableFile(file)) {
        latestRequest.current += 1;
        setReading({
          ...IDLE_READING,
          error: "That file isn't a photo or a screenshot.",
          canTryPicture: true,
        });
        return null;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        latestRequest.current += 1;
        setReading({
          ...IDLE_READING,
          error: `That file is too big to read. Try one under ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`,
          canTryPicture: true,
        });
        return null;
      }
      const result = await run(
        () => extractProductFromFile(file, ingredient),
        () => NO_STORE,
        ingredient,
        true,
      );
      return result;
    },
    [run],
  );

  return { reading, read, readFile, reset };
}

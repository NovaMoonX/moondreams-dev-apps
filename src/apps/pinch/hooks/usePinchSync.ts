import { useEffect } from 'react';

import { useAppDispatch } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  startFamiliesListener,
  startIngredientsListener,
  startProductsListener,
  startStoresListener,
} from '@apps/pinch/store/listeners/kitchenListeners';
import {
  clearFamilies,
  setFamilies,
  setFamiliesLoadError,
} from '@apps/pinch/store/slices/familiesSlice';
import {
  clearIngredients,
  setIngredients,
  setIngredientsLoadError,
} from '@apps/pinch/store/slices/ingredientsSlice';
import {
  clearProducts,
  setProducts,
  setProductsLoadError,
} from '@apps/pinch/store/slices/productsSlice';
import {
  clearStores,
  setStores,
  setStoresLoadError,
} from '@apps/pinch/store/slices/storesSlice';

/** Starts the listeners for the signed-in person's own kitchen, once per uid; screens only read the store. */
export function usePinchSync(uid: string | null) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!uid) {
      dispatch(clearIngredients());
      dispatch(clearFamilies());
      dispatch(clearStores());
      dispatch(clearProducts());
      return;
    }

    const unsubscribeIngredients = startIngredientsListener(
      uid,
      (records) => dispatch(setIngredients(records)),
      (error) =>
        dispatch(
          setIngredientsLoadError(
            getErrorMessage(error, 'Unable to load your ingredients.'),
          ),
        ),
    );
    const unsubscribeFamilies = startFamiliesListener(
      uid,
      (families) => dispatch(setFamilies(families)),
      (error) =>
        dispatch(
          setFamiliesLoadError(
            getErrorMessage(error, 'Unable to load your ingredient families.'),
          ),
        ),
    );

    const unsubscribeStores = startStoresListener(
      uid,
      (stores) => dispatch(setStores(stores)),
      (error) =>
        dispatch(
          setStoresLoadError(
            getErrorMessage(error, 'Unable to load your stores.'),
          ),
        ),
    );

    const unsubscribeProducts = startProductsListener(
      uid,
      (products) => dispatch(setProducts(products)),
      (error) =>
        dispatch(
          setProductsLoadError(
            getErrorMessage(error, 'Unable to load your products.'),
          ),
        ),
    );

    return () => {
      unsubscribeProducts();
      unsubscribeStores();
      unsubscribeIngredients();
      unsubscribeFamilies();
    };
  }, [dispatch, uid]);
}

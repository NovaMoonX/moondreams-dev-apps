import { useEffect } from 'react';

import { useAppDispatch } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  startFamiliesListener,
  startMealsListener,
  startPlannedMealsListener,
  startIngredientsListener,
  startProductsListener,
  startRecipesListener,
  startSettingsListener,
  startShoppingListener,
  startSourcesListener,
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
  clearMeals,
  setMeals,
  setMealsLoadError,
} from '@apps/pinch/store/slices/mealsSlice';
import {
  clearPlannedMeals,
  setPlannedMeals,
  setPlannedMealsLoadError,
} from '@apps/pinch/store/slices/plannedMealsSlice';
import {
  clearProducts,
  setProducts,
  setProductsLoadError,
} from '@apps/pinch/store/slices/productsSlice';
import {
  clearRecipes,
  setRecipes,
  setRecipesLoadError,
} from '@apps/pinch/store/slices/recipesSlice';
import {
  clearSettings,
  setSettings,
  setSettingsLoadError,
} from '@apps/pinch/store/slices/settingsSlice';
import {
  clearShopping,
  setShopping,
  setShoppingLoadError,
} from '@apps/pinch/store/slices/shoppingSlice';
import {
  clearSources,
  setSources,
  setSourcesLoadError,
} from '@apps/pinch/store/slices/sourcesSlice';
import {
  clearStores,
  setStores,
  setStoresLoadError,
} from '@apps/pinch/store/slices/storesSlice';

import { getMonthWindow } from '@apps/pinch/utils/dayKeys';

/** Starts the listeners for the signed-in person's own kitchen, once per uid, and the planned-meals window once per shown month; screens only read the store. */
export function usePinchSync(uid: string | null, shownMonth: string) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!uid) {
      dispatch(clearIngredients());
      dispatch(clearFamilies());
      dispatch(clearStores());
      dispatch(clearProducts());
      dispatch(clearRecipes());
      dispatch(clearSources());
      dispatch(clearShopping());
      dispatch(clearSettings());
      dispatch(clearPlannedMeals());
      dispatch(clearMeals());
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

    const unsubscribeRecipes = startRecipesListener(
      uid,
      (recipes) => dispatch(setRecipes(recipes)),
      (error) =>
        dispatch(
          setRecipesLoadError(
            getErrorMessage(error, 'Unable to load your recipes.'),
          ),
        ),
    );

    const unsubscribeSources = startSourcesListener(
      uid,
      (sources) => dispatch(setSources(sources)),
      (error) => {
        console.error('Pinch sources listener failed', error);
        dispatch(
          setSourcesLoadError(
            getErrorMessage(error, 'Unable to load your recipe sources.'),
          ),
        );
      },
    );

    const unsubscribeShopping = startShoppingListener(
      uid,
      (items) => dispatch(setShopping(items)),
      (error) =>
        dispatch(
          setShoppingLoadError(
            getErrorMessage(error, 'Unable to load your shopping list.'),
          ),
        ),
    );

    const unsubscribeSettings = startSettingsListener(
      uid,
      (settings) => dispatch(setSettings(settings)),
      (error) =>
        dispatch(
          setSettingsLoadError(
            getErrorMessage(error, 'Unable to load your settings.'),
          ),
        ),
    );

    const unsubscribeMeals = startMealsListener(
      uid,
      (meals) => dispatch(setMeals(meals)),
      (error) =>
        dispatch(
          setMealsLoadError(
            getErrorMessage(error, 'Unable to load your saved meals.'),
          ),
        ),
    );

    return () => {
      unsubscribeMeals();
      unsubscribeSettings();
      unsubscribeShopping();
      unsubscribeSources();
      unsubscribeRecipes();
      unsubscribeProducts();
      unsubscribeStores();
      unsubscribeIngredients();
      unsubscribeFamilies();
    };
  }, [dispatch, uid]);

  useEffect(() => {
    if (!uid) {
      return;
    }

    return startPlannedMealsListener(
      uid,
      getMonthWindow(shownMonth),
      (items) => dispatch(setPlannedMeals({ windowKey: shownMonth, items })),
      (error) =>
        dispatch(
          setPlannedMealsLoadError(
            getErrorMessage(error, 'Unable to load your planned meals.'),
          ),
        ),
    );
  }, [dispatch, uid, shownMonth]);
}

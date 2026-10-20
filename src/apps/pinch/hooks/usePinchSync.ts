import { useEffect } from 'react';

import { useAppDispatch } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { ensurePinchSettings } from '@apps/pinch/store/actions/pinchSettingsActions';
import {
  startCollectionsListener,
  startContainersListener,
  startCooksListener,
  startFamiliesListener,
  startMealsListener,
  startNotesListener,
  startPackagesListener,
  startPinchSettingsListener,
  startPlannedMealsListener,
  startIdeasListener,
  startIngredientsListener,
  startProductsListener,
  startRecipesListener,
  startSettingsListener,
  startSharesListener,
  startShoppingListener,
  startSourcesListener,
  startStoresListener,
} from '@apps/pinch/store/listeners/kitchenListeners';
import {
  clearCollections,
  setCollections,
  setCollectionsLoadError,
} from '@apps/pinch/store/slices/collectionsSlice';
import {
  clearContainers,
  setContainers,
  setContainersLoadError,
} from '@apps/pinch/store/slices/containersSlice';
import {
  clearCooks,
  setCooks,
  setCooksLoadError,
} from '@apps/pinch/store/slices/cooksSlice';
import {
  clearFamilies,
  setFamilies,
  setFamiliesLoadError,
} from '@apps/pinch/store/slices/familiesSlice';
import {
  clearIdeas,
  setIdeas,
  setIdeasLoadError,
} from '@apps/pinch/store/slices/ideasSlice';
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
  clearNotes,
  setNotes,
  setNotesLoadError,
} from '@apps/pinch/store/slices/notesSlice';
import {
  clearPackages,
  setPackages,
  setPackagesLoadError,
} from '@apps/pinch/store/slices/packagesSlice';
import {
  clearPinchSettings,
  setPinchSettings,
  setPinchSettingsLoadError,
} from '@apps/pinch/store/slices/pinchSettingsSlice';
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
  clearShares,
  setShares,
  setSharesLoadError,
} from '@apps/pinch/store/slices/sharesSlice';
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
      dispatch(clearCollections());
      dispatch(clearShopping());
      dispatch(clearIdeas());
      dispatch(clearCooks());
      dispatch(clearNotes());
      dispatch(clearContainers());
      dispatch(clearPackages());
      dispatch(clearSettings());
      dispatch(clearPinchSettings());
      dispatch(clearPlannedMeals());
      dispatch(clearMeals());
      dispatch(clearShares());
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

    const unsubscribeCollections = startCollectionsListener(
      uid,
      (collections) => dispatch(setCollections(collections)),
      (error) => {
        console.error('Pinch collections listener failed', error);
        dispatch(
          setCollectionsLoadError(
            getErrorMessage(error, 'Unable to load your recipe collections.'),
          ),
        );
      },
    );

    const unsubscribeShopping = startShoppingListener(
      uid,
      (items) => dispatch(setShopping(items)),
      (error) => {
        console.error('Pinch shopping listener failed', error);
        dispatch(
          setShoppingLoadError(
            getErrorMessage(error, 'Unable to load your shopping list.'),
          ),
        );
      },
    );

    const unsubscribeIdeas = startIdeasListener(
      uid,
      (ideas) => dispatch(setIdeas(ideas)),
      (error) => {
        console.error('Pinch ideas listener failed', error);
        dispatch(
          setIdeasLoadError(
            getErrorMessage(error, 'Unable to load your recipe ideas.'),
          ),
        );
      },
    );

    const unsubscribeCooks = startCooksListener(
      uid,
      (cooks) => dispatch(setCooks(cooks)),
      (error) => {
        console.error('Pinch cooks listener failed', error);
        dispatch(
          setCooksLoadError(
            getErrorMessage(error, 'Unable to load your cooking history.'),
          ),
        );
      },
    );

    const unsubscribeNotes = startNotesListener(
      uid,
      (notes) => dispatch(setNotes(notes)),
      (error) => {
        console.error('Pinch notes listener failed', error);
        dispatch(
          setNotesLoadError(
            getErrorMessage(error, 'Unable to load your recipe notes.'),
          ),
        );
      },
    );

    const unsubscribeContainers = startContainersListener(
      uid,
      (containers) => dispatch(setContainers(containers)),
      (error) => {
        console.error('Pinch containers listener failed', error);
        dispatch(
          setContainersLoadError(
            getErrorMessage(error, 'Unable to load your fridge and freezer.'),
          ),
        );
      },
    );

    const unsubscribePackages = startPackagesListener(
      uid,
      (packages) => dispatch(setPackages(packages)),
      (error) => {
        console.error('Pinch packages listener failed', error);
        dispatch(
          setPackagesLoadError(
            getErrorMessage(error, 'Unable to load your pantry.'),
          ),
        );
      },
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

    let hasAskedForSettings = false;
    const unsubscribePinchSettings = startPinchSettingsListener(
      uid,
      (settings) => {
        dispatch(setPinchSettings(settings));
        if (settings === null && !hasAskedForSettings) {
          hasAskedForSettings = true;
          void dispatch(ensurePinchSettings(uid));
        }
      },
      (error) => {
        console.error('Pinch settings listener failed', error);
        dispatch(
          setPinchSettingsLoadError(
            getErrorMessage(error, 'Unable to load your settings.'),
          ),
        );
      },
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

    const unsubscribeShares = startSharesListener(
      uid,
      (shares) => dispatch(setShares(shares)),
      (error) => {
        console.error('Pinch shares listener failed', error);
        dispatch(
          setSharesLoadError(
            getErrorMessage(error, 'Unable to load your shared links.'),
          ),
        );
      },
    );

    return () => {
      unsubscribeShares();
      unsubscribeMeals();
      unsubscribePinchSettings();
      unsubscribeSettings();
      unsubscribePackages();
      unsubscribeContainers();
      unsubscribeNotes();
      unsubscribeCooks();
      unsubscribeIdeas();
      unsubscribeShopping();
      unsubscribeCollections();
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

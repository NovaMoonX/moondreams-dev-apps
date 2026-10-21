import { useEffect } from 'react';

import { useAppDispatch } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  startFamiliesListener,
  startIngredientsListener,
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

/** Starts the listeners for the signed-in person's own kitchen, once per uid; screens only read the store. */
export function usePinchSync(uid: string | null) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!uid) {
      dispatch(clearIngredients());
      dispatch(clearFamilies());
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

    return () => {
      unsubscribeIngredients();
      unsubscribeFamilies();
    };
  }, [dispatch, uid]);
}

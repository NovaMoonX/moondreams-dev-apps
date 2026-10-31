import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { RootState } from '@/store';
import {
  type FeatureGatesDoc,
  isGateOpen,
  readGateSetting,
} from '@lib/gates/featureGates';

export interface FeatureGatesState {
  /** `null` once read and empty; a missing key means not read yet. Both fall back to the declared defaults. */
  byApp: Record<string, FeatureGatesDoc | null>;
}

const initialState: FeatureGatesState = {
  byApp: {},
};

export const featureGatesSlice = createSlice({
  name: 'featureGates',
  initialState,
  reducers: {
    setFeatureGatesDoc(
      state,
      action: PayloadAction<{ appId: string; gatesDoc: FeatureGatesDoc | null }>,
    ) {
      state.byApp[action.payload.appId] = action.payload.gatesDoc;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setFeatureGatesDoc } = featureGatesSlice.actions;
export const featureGatesReducer = featureGatesSlice.reducer;

export default featureGatesReducer;

export function selectIsGateOpen(state: RootState, appId: string, gateId: string) {
  const user = state.user.currentUser;
  const setting = readGateSetting(state.featureGates.byApp[appId], appId, gateId);
  return isGateOpen(setting, user ? { uid: user.uid, isAdmin: user.isAdmin } : null);
}

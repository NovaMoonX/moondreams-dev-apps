import { useState } from 'react';

import type { PlacementMode } from '@apps/helm/components/today/Placement';

/** Which view a suggested slot's sheet shows: the slot, other times, or other days. */
export const usePlacementMode = () => useState<PlacementMode>('main');

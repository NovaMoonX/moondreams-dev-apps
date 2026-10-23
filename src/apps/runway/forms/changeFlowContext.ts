import { createContext } from 'react';

import type { ChangeFlow } from '@apps/runway/forms/useChangeFlow';
import type { ItemPayload } from '@apps/runway/utils/changeText';
import type { ItemKind } from '@apps/runway/types';

export interface ChangeFlowValue {
  flow: ChangeFlow;
  itemId: string;
  kind: ItemKind;
  candidate: ItemPayload | null;
}

/** What the form being edited hands to the "From when" and effect section it draws as its last field. */
export const ChangeFlowContext = createContext<ChangeFlowValue | null>(null);

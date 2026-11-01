import { createContext, type ReactNode } from 'react';

import type { ChangeFlow } from '@apps/runway/forms/useChangeFlow';
import type { ItemPayload } from '@apps/runway/utils/changeText';
import type { ItemKind } from '@apps/runway/types';

export interface ChangeFlowValue {
  flow: ChangeFlow;
  itemId: string;
  kind: ItemKind;
  candidate: ItemPayload | null;
  /** Offered under an effect warning that says why a pay is short. */
  warningActions?: ReactNode;
}

/** What the form being edited hands to the "From when" and effect section it draws as its last field. */
export const ChangeFlowContext = createContext<ChangeFlowValue | null>(null);

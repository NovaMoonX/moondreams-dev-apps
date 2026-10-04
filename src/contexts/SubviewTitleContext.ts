import { createContext } from 'react';

/** The title a subview's header already shows, so a `SectionHeader` repeating it can drop its own. */
export const SubviewTitleContext = createContext<string | null>(null);

import { createContext } from 'react';

interface SubviewContextValue {
  /** The title the subview's header already shows. */
  title: string | null;
  /** The header's right-hand slot, where a repeating `SectionHeader` sends its action. */
  actionTarget: HTMLElement | null;
}

/** Lets a `SectionHeader` inside a subview hand its title over to the subview's own header. */
export const SubviewContext = createContext<SubviewContextValue | null>(null);

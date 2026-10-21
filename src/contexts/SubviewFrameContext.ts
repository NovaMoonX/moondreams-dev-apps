import { createContext, type ComponentType } from 'react';

export interface SubviewFrameIdentity {
  name: string;
  logoSrc: string | null;
}

/** For each part, `undefined` keeps the default and `null` draws nothing. */
export interface SubviewFrameParts {
  /** Who the eyebrow names; the default is the app the page belongs to. */
  identity?: SubviewFrameIdentity | null;
  /** The non-interactive layer around the screen (default: a rounded window cut out of a tinted edge, styled by the `--subview-frame-*` tokens). */
  Surround?: ComponentType | null;
  /** The line in the 24px strip above the header (default: the app's logo and name). */
  Eyebrow?: ComponentType<{ identity: SubviewFrameIdentity | null }> | null;
}

/** What a mini-app provides, through `SubviewFrameProvider`, to give its subviews a frame of its own structure. */
export const SubviewFrameContext = createContext<SubviewFrameParts>({});

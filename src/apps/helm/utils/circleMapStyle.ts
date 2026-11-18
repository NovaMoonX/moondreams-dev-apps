import type { StylesheetJson } from 'cytoscape';

export interface MapColours {
  foreground: string;
  mutedForeground: string;
  muted: string;
  primary: string;
  border: string;
  background: string;
}

const TOKENS: Record<keyof MapColours, string> = {
  foreground: '--color-foreground',
  mutedForeground: '--color-muted-foreground',
  muted: '--color-muted',
  primary: '--color-primary',
  border: '--color-border',
  background: '--color-card',
};

/** The theme's colours as they are now. */
export const readMapColours = (): MapColours => {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    Object.entries(TOKENS).map(([key, token]) => [
      key,
      style.getPropertyValue(token).trim() || 'currentColor',
    ]),
  ) as unknown as MapColours;
};

const toDisc = (initial: string, isPrivate: boolean, colours: MapColours) => {
  const mark = isPrivate
    ? `<rect x="14" y="19" width="12" height="9" rx="2" fill="${colours.mutedForeground}"/><path d="M16.5 19v-3a3.5 3.5 0 0 1 7 0v3" fill="none" stroke="${colours.mutedForeground}" stroke-width="2"/>`
    : `<text x="20" y="26.5" text-anchor="middle" font-size="18" font-weight="500" font-family="sans-serif" fill="${colours.mutedForeground}">${initial.replace(/[<>&"]/g, '')}</text>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 40 40"><rect width="40" height="40" fill="${colours.muted}"/>${mark}</svg>`,
  )}`;
};

export const buildMapStyle = (colours: MapColours): StylesheetJson => [
  {
    selector: 'node',
    style: {
      width: 44,
      height: 44,
      shape: 'ellipse',
      'background-color': colours.muted,
      'background-fit': 'cover',
      'background-clip': 'node',
      'background-image': (node) =>
        node.data('photo') ??
        toDisc(node.data('initial'), node.data('isPrivate'), colours),
      'border-width': 1.5,
      'border-color': colours.border,
      label: 'data(label)',
      color: colours.foreground,
      'font-size': 12,
      'text-valign': 'bottom',
      'text-margin-y': 4,
      'text-wrap': 'ellipsis',
      'text-max-width': '84px',
      'text-background-color': colours.background,
      'text-background-opacity': 1,
      'text-background-padding': '2px',
      'text-background-shape': 'roundrectangle',
      'min-zoomed-font-size': 8,
    },
  },
  {
    selector: 'node[?isOwner]',
    style: { width: 60, height: 60, 'border-color': colours.primary },
  },
  {
    selector: 'node:selected',
    style: { 'border-width': 3, 'border-color': colours.primary },
  },
  {
    selector: 'edge',
    style: {
      width: 1.5,
      'curve-style': 'straight',
      'line-color': colours.mutedForeground,
      opacity: 0.85,
    },
  },
  {
    selector: 'edge[kind = "family"]',
    style: { 'line-color': colours.foreground, 'line-style': 'solid' },
  },
  {
    selector: 'edge[kind = "couple"]',
    style: {
      width: 4,
      'line-color': colours.background,
      'line-outline-width': 1.25,
      'line-outline-color': colours.primary,
    },
  },
  {
    selector: 'edge[kind = "friend"]',
    style: { 'line-style': 'dotted', width: 2 },
  },
  {
    selector: 'edge[kind = "work"]',
    style: { 'line-style': 'dashed' },
  },
  { selector: 'edge[?isFigured]', style: { opacity: 0.4 } },
  { selector: 'edge[?isPast]', style: { opacity: 0.25 } },
];

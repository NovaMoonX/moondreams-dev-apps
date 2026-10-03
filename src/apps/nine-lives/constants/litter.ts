import type { LitterType } from '@apps/nine-lives/types';

export const DEFAULT_LITTER_FILL_DEPTH = 3;
export const DEFAULT_LITTER_FILL_DEPTH_UNIT = 'in' as const;

export const LITTER_DEPTH_UNIT_OPTIONS = [
  { label: 'Inches (in)', value: 'in' },
  { label: 'Centimeters (cm)', value: 'cm' },
];

export const LITTER_WEIGHT_UNIT_OPTIONS = [
  { label: 'Pounds (lb)', value: 'lb' },
  { label: 'Kilograms (kg)', value: 'kg' },
];

export const LITTER_TYPE_LABELS: Record<LitterType, string> = {
  clumping_clay: 'Clumping clay',
  non_clumping_clay: 'Non-clumping clay',
  pine_wood_pellet: 'Pine / wood pellet',
  paper: 'Paper',
  crystal_silica: 'Crystal / silica',
  corn: 'Corn',
  wheat: 'Wheat',
  walnut: 'Walnut',
  custom: 'Custom',
};

export const LITTER_GUIDE_SEEN_KEY = 'nine-lives:litter-weigh-in-guide-seen';

export const LITTER_WEIGH_IN_STEPS = [
  {
    showFillTarget: false,
    emoji: '🧹',
    title: 'Scoop and sift',
    body: 'Take out the poop and any clumps so only clean litter is left in the box.',
  },
  {
    showFillTarget: false,
    emoji: '⚖️',
    title: 'Weigh what’s left',
    body: 'Put the box on your scale and note the number. If you like, measure the litter depth too. An empty or brand-new box is 0.',
  },
  {
    showFillTarget: false,
    emoji: '🪣',
    title: 'Full change? Start fresh',
    body: 'Only for a full change: pour the old litter out and, if you use one, sprinkle a thin layer of deodorizer (like baking soda or Arm & Hammer) over the bottom.',
  },
  {
    emoji: '📏',
    showFillTarget: true,
    title: 'Fill it up',
    body: 'Add litter until the box reaches its fill level, by depth, by weight, or both. Most cats like about 3 inches.',
  },
  {
    showFillTarget: false,
    emoji: '✅',
    title: 'Weigh it again',
    body: 'Note the new weight (and depth) so the next check can tell how much got used.',
  },
] as const;

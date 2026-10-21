/** Categorical slots in a fixed order (light, then dark), checked for colour-blind separation on both surfaces. */
export const DOUGHNUT_SLOT_CLASSES = [
  'stroke-[#2a78d6] dark:stroke-[#3987e5]',
  'stroke-[#eb6834] dark:stroke-[#d95926]',
  'stroke-[#1baf7a] dark:stroke-[#199e70]',
  'stroke-[#eda100] dark:stroke-[#c98500]',
  'stroke-[#e87ba4] dark:stroke-[#d55181]',
  'stroke-[#008300] dark:stroke-[#008300]',
] as const;

export const DOUGHNUT_SLOT_FILL_CLASSES = [
  'bg-[#2a78d6] dark:bg-[#3987e5]',
  'bg-[#eb6834] dark:bg-[#d95926]',
  'bg-[#1baf7a] dark:bg-[#199e70]',
  'bg-[#eda100] dark:bg-[#c98500]',
  'bg-[#e87ba4] dark:bg-[#d55181]',
  'bg-[#008300] dark:bg-[#008300]',
] as const;

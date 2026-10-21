export type MacroKey = 'calories' | 'protein' | 'carbs' | 'fat';

/** One emoji per metric, for everywhere a metric is named. */
export const MACRO_EMOJIS: Record<MacroKey, string> = {
  calories: '🔥',
  protein: '💪',
  carbs: '🌾',
  fat: '🥑',
};

/** Calories are whole numbers, grams keep one decimal. */
export const formatMacro = (key: MacroKey, value: number) =>
  String(key === 'calories' ? Math.round(value) : Math.round(value * 10) / 10);

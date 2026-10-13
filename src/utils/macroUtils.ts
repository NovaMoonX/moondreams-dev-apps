export type MacroKey = 'calories' | 'protein' | 'carbs' | 'fat';

/** Calories are whole numbers, grams keep one decimal. */
export const formatMacro = (key: MacroKey, value: number) =>
  String(key === 'calories' ? Math.round(value) : Math.round(value * 10) / 10);

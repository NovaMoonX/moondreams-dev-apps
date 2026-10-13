import { join } from '@moondreamsdev/dreamer-ui/utils';

import { formatMacro } from '@/utils/macroUtils';

export interface MacroValues {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}

type MacroKey = keyof MacroValues;

const MACROS: { key: MacroKey; emoji: string; label: string; unit: string }[] =
  [
    { key: 'calories', emoji: '🔥', label: 'Calories', unit: '' },
    { key: 'protein', emoji: '💪', label: 'Protein', unit: 'g' },
    { key: 'carbs', emoji: '🌾', label: 'Carbs', unit: 'g' },
    { key: 'fat', emoji: '🥑', label: 'Fat', unit: 'g' },
  ];

interface MacroStatsProps {
  values: MacroValues;
  /** The metrics to show; omitted shows every one that has a value. */
  show?: Partial<Record<MacroKey, boolean>>;
  /** A line of emoji and numbers for a row or a drawer, or small tiles for a summary. */
  variant?: 'inline' | 'tiles';
  className?: string;
}

/** Calories and macros as emoji plus a number (🔥 495 · 💪 61g), so a screen of figures reads at a glance. Renders nothing when no metric has a value. */
function MacroStats({
  values,
  show,
  variant = 'inline',
  className,
}: MacroStatsProps) {
  const shown = MACROS.filter(
    (macro) => (show ? show[macro.key] : true) && values[macro.key] !== null,
  );

  if (shown.length === 0) {
    return null;
  }

  if (variant === 'tiles') {
    return (
      <ul
        className={join('grid grid-cols-4 gap-2', className)}
        aria-label='Nutrition'
      >
        {shown.map((macro) => (
          <li
            key={macro.key}
            className='bg-secondary flex flex-col items-center rounded-xl px-1 py-2 text-center'
          >
            <span aria-hidden='true' className='text-base leading-none'>
              {macro.emoji}
            </span>
            <span className='mt-1 text-sm font-semibold tabular-nums'>
              {formatMacro(macro.key, values[macro.key] as number)}
              {macro.unit && (
                <span className='text-muted-foreground text-xs font-normal'>
                  {macro.unit}
                </span>
              )}
            </span>
            <span className='text-muted-foreground text-[0.6875rem] leading-tight'>
              {macro.label}
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <span
      className={join('inline-flex flex-wrap gap-x-3 gap-y-0.5', className)}
    >
      {shown.map((macro) => (
        <span
          key={macro.key}
          className='whitespace-nowrap tabular-nums'
          title={macro.label}
        >
          <span aria-hidden='true'>{macro.emoji}</span>
          <span className='sr-only'>{macro.label} </span>
          {formatMacro(macro.key, values[macro.key] as number)}
          {macro.unit}
        </span>
      ))}
    </span>
  );
}

export default MacroStats;

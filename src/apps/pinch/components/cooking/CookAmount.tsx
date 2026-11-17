import { useContext } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { CookConversionContext } from '@apps/pinch/components/cooking/cookConversionContext';
import type { CookRow } from '@apps/pinch/components/cooking/CookIngredientsView';

interface CookAmountProps {
  row: Pick<CookRow, 'amountText' | 'conversion'>;
  className?: string;
}

/** A measured amount that opens its other units when tapped; plain text for a line with nothing to convert. */
export function CookAmountButton({ row, className }: CookAmountProps) {
  const { openKey, onToggle } = useContext(CookConversionContext);
  if (row.conversion === null) {
    return <span className={className}>{row.amountText}</span>;
  }
  const { key } = row.conversion;
  const isOpen = openKey === key;
  return (
    <Button
      type='button'
      variant='tertiary'
      size='sm'
      aria-expanded={isOpen}
      aria-label={`${row.amountText}, show other units`}
      onClick={() => onToggle(key)}
      className={join(
        'text-foreground! relative -mr-1.5 h-auto! min-h-0! shrink-0 px-1.5! py-0.5! font-[inherit] text-[length:inherit] before:absolute before:-inset-x-2 before:-inset-y-2.5 before:content-[""]',
        isOpen && 'bg-accent!',
        className,
      )}
    >
      {row.amountText}
    </Button>
  );
}

/** The other units of an opened amount, read from arm's length at the stove: a tinted card in full-contrast type, one measure per item. */
export function CookConversionLine({
  row,
  className,
}: {
  row: Pick<CookRow, 'conversion'>;
  className?: string;
}) {
  const { openKey } = useContext(CookConversionContext);
  if (row.conversion === null || openKey !== row.conversion.key) return null;
  const parts = row.conversion.text.replace(/^=\s*/, '').split(' · ');
  const lines = (['', ' by weight', ' by volume'] as const)
    .map((suffix) => ({
      label: suffix.trim(),
      values: parts
        .filter((part) =>
          suffix === ''
            ? !/ by (weight|volume)$/.test(part)
            : part.endsWith(suffix),
        )
        .map((part) => part.slice(0, part.length - suffix.length)),
    }))
    .filter((line) => line.values.length > 0);
  return (
    <div
      className={join(
        'bg-accent text-accent-foreground space-y-1 rounded-xl px-3 py-2 text-lg',
        className,
      )}
    >
      {lines.map((line) => (
        <p
          key={line.label}
          className='flex flex-wrap items-baseline gap-x-4 gap-y-1'
        >
          <span className='sr-only'>{line.label || 'Also'}: </span>
          {line.label && (
            <span
              aria-hidden='true'
              className='w-full text-xs font-medium tracking-wide uppercase opacity-70'
            >
              {line.label}
            </span>
          )}
          {line.values.map((value) => (
            <span
              key={value}
              className='font-semibold whitespace-nowrap tabular-nums'
            >
              {value}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}

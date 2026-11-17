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
        'text-foreground! relative h-auto! min-h-0! shrink-0 px-1.5! py-0.5! font-[inherit] text-[length:inherit] before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-[""]',
        isOpen && 'bg-accent!',
        className,
      )}
    >
      {row.amountText}
    </Button>
  );
}

/** The one muted line of other units under a row whose amount is open. */
export function CookConversionLine({
  row,
  className,
}: {
  row: Pick<CookRow, 'conversion'>;
  className?: string;
}) {
  const { openKey } = useContext(CookConversionContext);
  if (row.conversion === null || openKey !== row.conversion.key) return null;
  return (
    <p className={join('text-muted-foreground text-xs', className)}>
      {row.conversion.text}
    </p>
  );
}

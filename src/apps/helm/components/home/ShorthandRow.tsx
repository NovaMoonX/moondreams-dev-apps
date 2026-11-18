import { Button } from '@moondreamsdev/dreamer-ui/components';

import { HELM_COPY } from '@apps/helm/constants';

interface ShorthandRowProps {
  onInsert: (text: string) => void;
}

const SHORTHANDS = [
  { insert: '@', label: HELM_COPY.shorthandPerson },
  { insert: '#', label: HELM_COPY.shorthandPlace },
  {
    insert: '^',
    label: HELM_COPY.shorthandDocument,
    ariaLabel: HELM_COPY.shorthandDocumentLabel,
  },
  { insert: '! ', label: HELM_COPY.shorthandUrgent },
] as const;

/** Tinted pills that type a shorthand character at the cursor. */
function ShorthandRow({ onInsert }: ShorthandRowProps) {
  return (
    <div
      role='group'
      aria-label={HELM_COPY.shorthandLabel}
      className='flex [scrollbar-width:none] items-center gap-2 overflow-x-auto [mask-image:linear-gradient(to_right,#000_calc(100%-28px),transparent)] py-1.5 pr-9 pl-3 [&::-webkit-scrollbar]:hidden'
    >
      {SHORTHANDS.map((entry) => (
        <Button
          key={entry.insert}
          type='button'
          variant='secondary'
          size='sm'
          aria-label={'ariaLabel' in entry ? entry.ariaLabel : undefined}
          className="relative h-7 min-h-0 shrink-0 rounded-full px-2.5 text-[13px] before:absolute before:-inset-x-1 before:-inset-y-1.5 before:content-['']"
          onClick={() => onInsert(entry.insert)}
        >
          {entry.label}
        </Button>
      ))}
    </div>
  );
}

export default ShorthandRow;

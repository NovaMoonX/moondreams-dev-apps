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

/** Quiet buttons that type a shorthand character at the cursor. */
function ShorthandRow({ onInsert }: ShorthandRowProps) {
  return (
    <div
      role='group'
      aria-label={HELM_COPY.shorthandLabel}
      className='-mx-4 -mt-1.5 mb-0.5 flex [scrollbar-width:none] items-center gap-1 overflow-x-auto px-4 py-1.5 [&::-webkit-scrollbar]:hidden'
    >
      {SHORTHANDS.map((entry) => (
        <Button
          key={entry.insert}
          type='button'
          variant='tertiary'
          size='sm'
          aria-label={'ariaLabel' in entry ? entry.ariaLabel : undefined}
          className="relative h-7 shrink-0 rounded-full px-2.5 text-[13px] before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']"
          onClick={() => onInsert(entry.insert)}
        >
          {entry.label}
        </Button>
      ))}
    </div>
  );
}

export default ShorthandRow;

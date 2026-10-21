import { Button } from '@moondreamsdev/dreamer-ui/components';

interface CantFindItButtonProps {
  /** The whole sentence: what was missing and what the button does about it. */
  children: string;
  onClick: () => void;
  isDisabled?: boolean;
}

/** The way out of a search or picker that doesn't hold what the person means: one centered accent pill under the results, never a text link. */
function CantFindItButton({
  children,
  onClick,
  isDisabled = false,
}: CantFindItButtonProps) {
  return (
    <div className='flex justify-center'>
      <Button
        type='button'
        variant='tertiary'
        rounded='full'
        disabled={isDisabled}
        className='bg-accent text-accent-foreground! hover:bg-accent/80 border-border h-auto min-h-10 max-w-full border px-4 py-2 text-center font-medium whitespace-normal'
        onClick={onClick}
      >
        {children}
      </Button>
    </div>
  );
}

export default CantFindItButton;

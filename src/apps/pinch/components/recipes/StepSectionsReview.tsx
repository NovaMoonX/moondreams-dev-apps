import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useQuery } from '@tanstack/react-query';

import DebugDetails from '@/components/DebugDetails';
import DetailSheet from '@/components/DetailSheet';
import SectionDivider from '@/components/SectionDivider';
import { getAiReadFailureMessage } from '@/lib/firebase/aiFailure';
import { splitRecipeSteps } from '@apps/pinch/lib/splitRecipeSteps';
import {
  groupStepSections,
  hasStepSections,
} from '@apps/pinch/utils/stepSections';

interface StepSectionsReviewProps {
  isOpen: boolean;
  steps: string[];
  title: string;
  onApply: (steps: string[], stepSections: (string | null)[]) => void;
  onClose: () => void;
}

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? '' : 's'}`;

/** Shows what an AI split of the recipe's steps would look like and changes nothing until the person accepts it. */
function StepSectionsReview({
  isOpen,
  steps,
  title,
  onApply,
  onClose,
}: StepSectionsReviewProps) {
  const { data, error, isError, isFetching, refetch } = useQuery({
    queryKey: ['pinch-split-steps', title, steps],
    queryFn: () => splitRecipeSteps(steps, title),
    enabled: isOpen,
    gcTime: 0,
    retry: false,
  });

  const blocks = data ? groupStepSections(data.steps, data.stepSections) : [];
  const sectionCount = blocks.filter((block) => block.name !== null).length;
  const isUnchanged =
    data !== undefined &&
    !hasStepSections(data.steps, data.stepSections) &&
    data.steps.length === steps.length &&
    data.steps.every((step, index) => step === steps[index]);

  const apply = () => {
    if (!data) return;
    onApply(data.steps, data.stepSections);
    onClose();
  };

  const getSummary = () => {
    if (!data) return '';
    const sections =
      sectionCount === 0 ? '' : ` in ${plural(sectionCount, 'section')}`;
    return `${plural(data.steps.length, 'step')}${sections}, from ${steps.length}. Nothing changes until you use them.`;
  };

  const getFooter = () => {
    if (isFetching) return undefined;
    if (isError) {
      return (
        <div className='flex gap-2 px-4 pb-4'>
          <Button
            type='button'
            variant='secondary'
            className='flex-1'
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button type='button' className='flex-1' onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      );
    }
    if (isUnchanged) {
      return (
        <div className='px-4 pb-4'>
          <Button type='button' className='w-full' onClick={onClose}>
            Close
          </Button>
        </div>
      );
    }
    if (!data) return undefined;
    return (
      <div className='flex gap-2 px-4 pb-4'>
        <Button
          type='button'
          variant='secondary'
          className='flex-1'
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button type='button' className='flex-1' onClick={apply}>
          Use these steps
        </Button>
      </div>
    );
  };

  const getBody = () => {
    if (isFetching) {
      return (
        <div className='flex flex-col items-center gap-3 py-10'>
          <div
            aria-hidden='true'
            className='border-foreground/20 border-t-accent size-8 rounded-full border-4 motion-safe:animate-spin'
          />
          <p className='text-muted-foreground text-sm' role='status'>
            Reading your steps…
          </p>
        </div>
      );
    }
    if (isError) {
      return (
        <div className='space-y-3 py-2'>
          <p className='text-sm'>
            {getAiReadFailureMessage(error, {
              subject: 'recipe',
              fallback: 'keep your steps as they are',
              unreadable:
                "We couldn't split these steps right now. Try again, or keep your steps as they are.",
            })}
          </p>
          <DebugDetails
            message={error instanceof Error ? error.message : String(error)}
            facts={[`Steps: ${steps.length}`]}
          />
        </div>
      );
    }
    if (!data) return null;
    if (isUnchanged) {
      return (
        <p className='text-muted-foreground py-2 text-sm'>
          These steps already read one action at a time.
        </p>
      );
    }
    return (
      <div className='space-y-4'>
        <p className='text-muted-foreground text-sm'>{getSummary()}</p>
        {blocks.map((block) => (
          <div key={block.key} className='space-y-2'>
            {block.name !== null && <SectionDivider label={block.name} />}
            <ol className='space-y-2'>
              {block.steps.map((step) => (
                <li key={step.index} className='flex gap-3 text-sm'>
                  <span className='text-muted-foreground w-5 shrink-0 text-right tabular-nums'>
                    {step.index + 1}.
                  </span>
                  <span>{step.text}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    );
  };

  return (
    <DetailSheet
      isOpen={isOpen}
      onClose={onClose}
      title='Split into sections'
      footer={getFooter()}
    >
      {getBody()}
    </DetailSheet>
  );
}

export default StepSectionsReview;

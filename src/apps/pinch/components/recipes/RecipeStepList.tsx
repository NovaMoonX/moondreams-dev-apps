import { join } from '@moondreamsdev/dreamer-ui/utils';

import SectionDivider from '@/components/SectionDivider';
import {
  groupStepSections,
  hasStepSections,
} from '@apps/pinch/utils/stepSections';

interface RecipeStepListProps {
  steps: string[];
  sections: (string | null)[];
  isRoomy?: boolean;
}

function RecipeStepList({ steps, sections, isRoomy }: RecipeStepListProps) {
  const node = isRoomy ? 'size-7 text-sm' : 'h-6 w-6 text-xs';
  const text = isRoomy ? 'text-base/7 wrap-break-word' : 'text-sm';
  const line = isRoomy ? 'left-[13px] top-8' : 'left-[11px] top-7';

  if (!hasStepSections(steps, sections)) {
    return (
      <ol className={isRoomy ? 'space-y-5 pt-1' : 'space-y-3'}>
        {steps.map((step, index) => (
          <li
            key={index}
            className={join('flex', isRoomy ? 'gap-3.5' : 'gap-3', text)}
          >
            <span
              className={join(
                'bg-accent text-accent-foreground flex shrink-0 items-center justify-center rounded-full font-semibold',
                node,
              )}
            >
              {index + 1}
            </span>
            <span className='min-w-0 space-y-1'>
              <span className='block whitespace-pre-wrap'>{step}</span>
            </span>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div>
      {groupStepSections(steps, sections).map((block) => (
        <div key={block.key}>
          {block.name !== null && (
            <SectionDivider label={block.name} className='pt-3 pb-1' />
          )}
          <ol className='pt-1'>
            {block.steps.map((step, position) => (
              <li
                key={step.index}
                className={join(
                  'relative flex gap-3',
                  text,
                  position < block.steps.length - 1 ? 'pb-4' : 'pb-1',
                )}
              >
                {position < block.steps.length - 1 && (
                  <span
                    aria-hidden='true'
                    className={join(
                      'border-border absolute bottom-1 border-l-2 border-dotted',
                      line,
                    )}
                  />
                )}
                <span
                  className={join(
                    'bg-accent text-accent-foreground relative flex shrink-0 items-center justify-center rounded-full font-semibold',
                    node,
                  )}
                >
                  {step.index + 1}
                </span>
                <span className='min-w-0 whitespace-pre-wrap'>{step.text}</span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

export default RecipeStepList;

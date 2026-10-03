import { LITTER_WEIGH_IN_STEPS } from '@apps/nine-lives/constants/litter';

interface LitterWeighInGuideProps {
  fillTargetText: string | null;
}

function LitterWeighInGuide({ fillTargetText }: LitterWeighInGuideProps) {
  return (
    <ol className='space-y-3'>
      {LITTER_WEIGH_IN_STEPS.map((step, index) => (
        <li key={step.title} className='flex items-start gap-3'>
          <span
            aria-hidden
            className='bg-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg'
          >
            {step.emoji}
          </span>
          <div className='min-w-0'>
            <p className='text-sm font-medium'>
              {index + 1}. {step.title}
            </p>
            <p className='text-muted-foreground text-sm'>{step.body}</p>
            {step.showFillTarget && fillTargetText && (
              <p className='text-primary mt-0.5 text-sm font-medium'>This box: {fillTargetText}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

export default LitterWeighInGuide;

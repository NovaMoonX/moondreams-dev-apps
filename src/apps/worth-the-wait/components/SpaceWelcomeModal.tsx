import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';
import { useState } from 'react';

const welcomeSteps = [
  {
    emoji: '🌟',
    title: 'Welcome',
    description:
      'Start with the built-in standard boxes to get a feel for the flow and create a shared starting point for both of you.',
  },
  {
    emoji: '📝',
    title: 'Add items and keep them hidden',
    description:
      'Open a box, add your thoughts or prompts, and each item stays hidden until the reveal. That keeps the surprise intact for both partners.',
  },
  {
    emoji: '✨',
    title: 'Choose how the reveal works',
    description:
      'You can use two reveal methods: a full reveal to uncover everything at once, or a raffle to randomly select one item to reveal together.',
  },
  {
    emoji: '🧩',
    title: 'Create custom boxes after the basics',
    description:
      'Once you are comfortable with the standard boxes and reveal flow, you can create your own custom boxes to match the kinds of moments you want to explore together.',
  },
] as const;

interface SpaceWelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function SpaceWelcomeModal({ isOpen, onClose }: SpaceWelcomeModalProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const currentStepDetails = welcomeSteps[currentStep];
  const isLastStep = currentStep === welcomeSteps.length - 1;

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className='space-y-3'>
        <div className='p-4 text-center'>
          <div className='mb-3 text-4xl leading-none'>
            {currentStepDetails.emoji}
          </div>
          <h3 className='text-foreground text-xl font-semibold'>
            {currentStepDetails.title}
          </h3>
          <p className='text-muted-foreground mt-2 text-sm leading-6'>
            {currentStepDetails.description}
          </p>
        </div>

        <div className='flex items-center justify-between gap-3'>
          <div className='text-muted-foreground text-xs'>
            Step {currentStep + 1} of {welcomeSteps.length}
          </div>

          <div className='flex gap-2'>
            {currentStep > 0 && (
              <Button
                type='button'
                variant='secondary'
                onClick={() => setCurrentStep((value) => value - 1)}
              >
                Back
              </Button>
            )}

            {isLastStep ? (
              <Button type='button' onClick={onClose}>
                Get started
              </Button>
            ) : (
              <Button
                type='button'
                onClick={() => setCurrentStep((value) => value + 1)}
              >
                Next
              </Button>
            )}
          </div>
        </div>

        <div className='flex items-center justify-center gap-2'>
          {welcomeSteps.map((step, index) => (
            <div
              key={step.title}
              className={
                index === currentStep
                  ? 'bg-foreground h-2.5 w-2.5 rounded-full'
                  : 'bg-muted-foreground/40 h-2.5 w-2.5 rounded-full'
              }
            />
          ))}
        </div>
      </div>
    </Modal>
  );
}

export default SpaceWelcomeModal;

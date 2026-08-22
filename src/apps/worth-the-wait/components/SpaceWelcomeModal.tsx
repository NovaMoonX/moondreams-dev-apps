import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';
import { useState } from 'react';

const welcomeSteps = [
  {
    emoji: '👋🏾',
    title: 'Welcome to Worth the Wait',
    description:
      "This is a private space for you and your partner to share things in a way that keeps the surprise intact until you're both ready to share.",
  },
  {
    emoji: '📦',
    title: 'Organize by "boxes"',
    description:
      'Each category has its own "box". For example, "Future Dates 📅" is a box where you can add ideas for future dates.',
  },
  {
    emoji: '📝',
    title: 'Add items',
    description:
      'Open a box, add your thoughts, prompts, questions, whatever! — and each item stays hidden until the reveal.',
  },
  {
    emoji: '✨',
    title: 'The reveal',
    description:
      "Once you're both ready to share, you can 'reveal' what's in the box. There are two reveal methods: a full reveal to share everything in the box, or a raffle to randomly select one item to be revealed."
  },
  {
    emoji: '🧩',
    title: 'Create custom boxes',
    description:
      "You start off with a set of 'starter' boxes. Once you are comfortable with those and the reveal flow, create your own custom boxes to match the kinds of moments you both want to explore together."
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
                size='sm'
                onClick={() => setCurrentStep((value) => value - 1)}
              >
                Back
              </Button>
            )}

            {isLastStep ? (
              <Button type='button' size='sm' onClick={onClose}>
                Get started
              </Button>
            ) : (
              <Button
                type='button'
                size='sm'
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

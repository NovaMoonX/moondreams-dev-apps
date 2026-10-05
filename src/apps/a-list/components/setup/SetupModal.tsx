import { useMemo, useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Modal,
} from '@moondreamsdev/dreamer-ui/components';

import ModalFooterActions from '@/components/ModalFooterActions';
import { useNow } from '@/hooks/useNow';
import { useAppDispatch } from '@/store';
import {
  fromDateInputValue,
  toLocalDateInputValue,
} from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import CostStep from '@apps/a-list/components/setup/CostStep';
import SetupStepper from '@apps/a-list/components/setup/SetupStepper';
import StartDateStep from '@apps/a-list/components/setup/StartDateStep';
import TaxStep from '@apps/a-list/components/setup/TaxStep';
import {
  A_LIST_PERKS,
  MAX_MONTHLY_GOAL,
  MAX_WEEKLY_GOAL,
} from '@apps/a-list/constants';
import { completeSetup } from '@apps/a-list/store/actions/membershipActions';
import {
  EMPTY_COST_STEP,
  evaluateCostStep,
  type CostStepValues,
} from '@apps/a-list/utils/costStep';

interface GoalValues {
  weeklyGoal: string;
  monthlyGoal: string;
}

const STEP_COUNT = 6;
const STEP_TITLES = [
  'Welcome',
  'Your membership',
  'Monthly cost',
  'Tax',
  'Start date',
  'Goals',
];
const { input } = FormFactories;

/** A blank goal is "no goal"; anything else must be a whole number in range. */
function parseGoal(
  value: string,
  max: number,
): { goal: number | null; isValid: boolean } {
  const trimmed = value.trim();
  if (trimmed === '') {
    return { goal: null, isValid: true };
  }

  const goal = Number(trimmed);
  const isValid = Number.isInteger(goal) && goal >= 1 && goal <= max;
  return { goal: isValid ? goal : null, isValid };
}

interface SetupModalProps {
  uid: string;
  onComplete: () => void;
  onClose: () => void;
}

function SetupModal({ uid, onComplete, onClose }: SetupModalProps) {
  const dispatch = useAppDispatch();
  const now = useNow();
  const [step, setStep] = useState(0);
  const [costValues, setCostValues] = useState<CostStepValues>({
    ...EMPTY_COST_STEP,
    showBillTotal: true,
  });
  const [goalValues, setGoalValues] = useState<GoalValues>({
    weeklyGoal: '',
    monthlyGoal: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const todayDay = fromDateInputValue(toLocalDateInputValue(now)) ?? 0;
  const cost = evaluateCostStep(costValues, todayDay);
  const weekly = parseGoal(goalValues.weeklyGoal, MAX_WEEKLY_GOAL);
  const monthly = parseGoal(goalValues.monthlyGoal, MAX_MONTHLY_GOAL);

  const goalFields = useMemo(
    () => [
      input({
        name: 'weeklyGoal',
        label: 'Movies a week',
        description: 'We count from Friday to Friday, like AMC does.',
        type: 'number',
        placeholder: '2',
        variant: 'outline',
        rounded: 'full',
        isValid: (value) =>
          parseGoal(value, MAX_WEEKLY_GOAL).isValid
            ? { valid: true }
            : {
                valid: false,
                message: `A whole number from 1 to ${MAX_WEEKLY_GOAL}.`,
              },
      }),
      input({
        name: 'monthlyGoal',
        label: 'Movies a month',
        type: 'number',
        placeholder: '6',
        variant: 'outline',
        rounded: 'full',
        isValid: (value) =>
          parseGoal(value, MAX_MONTHLY_GOAL).isValid
            ? { valid: true }
            : {
                valid: false,
                message: `A whole number from 1 to ${MAX_MONTHLY_GOAL}.`,
              },
      }),
    ],
    [],
  );

  const handleFinish = async () => {
    if (
      !cost.isValid ||
      cost.costCents === null ||
      cost.startDate === null ||
      !weekly.isValid ||
      !monthly.isValid
    ) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await dispatch(
        completeSetup({
          uid,
          draft: {
            monthlyCostCents: cost.costCents,
            billTotalCents: cost.billTotalCents,
            taxRate: cost.taxRate,
            startDate: cost.startDate,
            weeklyGoal: weekly.goal,
            monthlyGoal: monthly.goal,
          },
        }),
      ).unwrap();
      onComplete();
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save your membership.'));
      setIsSubmitting(false);
    }
  };

  const getStepView = () => {
    if (step === 0) {
      return {
        body: (
          <div className='space-y-4 text-center'>
            <p className='py-2 text-8xl' aria-hidden='true'>
              🍿
            </p>
            <div className='space-y-2'>
              <h3 className='text-2xl font-semibold'>
                Welcome to A-List Tracker
              </h3>
              <p className='text-muted-foreground mx-auto max-w-xs text-sm'>
                Let's find out if your AMC A-List membership is paying for
                itself. It only takes a minute to set up.
              </p>
            </div>
          </div>
        ),
        canContinue: true,
        nextLabel: "Let's go",
      };
    }

    if (step === 1) {
      return {
        body: (
          <div className='space-y-4'>
            <div className='space-y-1 text-center'>
              <h3 className='text-xl font-semibold'>
                Here's what you're covered for
              </h3>
              <p className='text-muted-foreground text-sm'>
                We'll keep track of all of it, so you can watch your savings
                add up.
              </p>
            </div>
            <ul className='space-y-2'>
              {A_LIST_PERKS.map((perk) => (
                <li
                  key={perk.text}
                  className='bg-secondary/60 flex min-h-14 items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm'
                >
                  <span
                    className='bg-card grid size-9 shrink-0 place-items-center rounded-full text-lg'
                    aria-hidden='true'
                  >
                    {perk.emoji}
                  </span>
                  {perk.text}
                </li>
              ))}
            </ul>
          </div>
        ),
        canContinue: true,
        nextLabel: 'Next',
      };
    }

    if (step === 2) {
      return {
        body: (
          <CostStep
            values={costValues}
            todayDay={todayDay}
            onChange={setCostValues}
          />
        ),
        canContinue:
          cost.costCents !== null && cost.costCents > 0 && !cost.errors.cost,
        nextLabel: 'Next',
      };
    }

    if (step === 3) {
      const hasTotal = costValues.billTotal.trim() !== '';
      return {
        body: (
          <TaxStep
            values={costValues}
            todayDay={todayDay}
            onChange={setCostValues}
          />
        ),
        canContinue: !cost.errors.billTotal,
        nextLabel: hasTotal ? 'Next' : 'Skip',
      };
    }

    if (step === 4) {
      return {
        body: (
          <StartDateStep
            values={costValues}
            todayDay={todayDay}
            onChange={setCostValues}
          />
        ),
        canContinue: cost.startDate !== null && !cost.errors.startDate,
        nextLabel: 'Next',
      };
    }

    return {
      body: (
        <div className='space-y-4'>
          <div className='space-y-2 text-center'>
            <p className='text-5xl' aria-hidden='true'>
              🎯
            </p>
            <h3 className='text-xl font-semibold'>
              How many movies would you like to catch?
            </h3>
            <p className='text-muted-foreground text-sm'>
              These are just for you, so skip them if you'd rather not.
            </p>
          </div>
          <Form
            id='a-list-setup-goals'
            form={goalFields}
            initialData={goalValues}
            columns={2}
            spacing='normal'
            onDataChange={(data) => setGoalValues(data as GoalValues)}
          />
        </div>
      ),
      canContinue: weekly.isValid && monthly.isValid,
      nextLabel: 'Finish',
    };
  };

  const { body, canContinue, nextLabel } = getStepView();
  const isLastStep = step === STEP_COUNT - 1;

  return (
    <Modal isOpen onClose={onClose} title={STEP_TITLES[step]}>
      <div className='space-y-6'>
        <SetupStepper step={step} total={STEP_COUNT} />
        {body}
        {error && (
          <p className='text-destructive text-center text-sm'>{error}</p>
        )}
        <ModalFooterActions
          rightActions={
            <>
              {step > 0 && (
                <Button
                  type='button'
                  variant='secondary'
                  rounded='full'
                  disabled={isSubmitting}
                  onClick={() => setStep(step - 1)}
                >
                  Back
                </Button>
              )}
              <Button
                type='button'
                rounded='full'
                loading={isSubmitting}
                disabled={!canContinue || isSubmitting}
                onClick={() =>
                  isLastStep ? void handleFinish() : setStep(step + 1)
                }
              >
                {nextLabel}
              </Button>
            </>
          }
        />
      </div>
    </Modal>
  );
}

export default SetupModal;

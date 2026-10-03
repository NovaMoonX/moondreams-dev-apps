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
import {
  EMPTY_COST_STEP,
  evaluateCostStep,
  type CostStepValues,
} from '@apps/a-list/utils/costStep';
import SetupStepper from '@apps/a-list/components/setup/SetupStepper';
import {
  A_LIST_PERKS,
  MAX_MONTHLY_GOAL,
  MAX_WEEKLY_GOAL,
} from '@apps/a-list/constants';
import { completeSetup } from '@apps/a-list/store/actions/membershipActions';

interface GoalValues {
  weeklyGoal: string;
  monthlyGoal: string;
}

const STEP_COUNT = 3;
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
}

function SetupModal({ uid }: SetupModalProps) {
  const dispatch = useAppDispatch();
  const now = useNow();
  const [step, setStep] = useState(0);
  const [costValues, setCostValues] = useState<CostStepValues>(EMPTY_COST_STEP);
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
        type: 'number',
        placeholder: '2',
        variant: 'outline',
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
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save your membership.'));
      setIsSubmitting(false);
    }
  };

  const getStepView = () => {
    if (step === 0) {
      return {
        title: 'Your A-List membership',
        body: (
          <div className='space-y-3'>
            <p className='text-muted-foreground text-sm'>
              Here's what your membership covers. We'll keep score of every
              movie it pays for.
            </p>
            <ul className='divide-border divide-y text-sm'>
              {A_LIST_PERKS.map((perk) => (
                <li key={perk} className='py-2'>
                  🎟️ {perk}
                </li>
              ))}
            </ul>
          </div>
        ),
        canContinue: true,
      };
    }

    if (step === 1) {
      return {
        title: 'Cost & start date',
        body: (
          <CostStep
            values={costValues}
            todayDay={todayDay}
            onChange={setCostValues}
          />
        ),
        canContinue: cost.isValid,
      };
    }

    return {
      title: 'Goals',
      body: (
        <div className='space-y-3'>
          <p className='text-muted-foreground text-sm'>
            How many movies would you like to catch? These are just for you, so
            skip them if you'd rather not.
          </p>
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
    };
  };

  const { title, body, canContinue } = getStepView();
  const isLastStep = step === STEP_COUNT - 1;

  return (
    <Modal
      isOpen
      onClose={() => undefined}
      title={title}
      hideCloseButton
      disableCloseOnOverlayClick
    >
      <div className='space-y-5'>
        <SetupStepper step={step} total={STEP_COUNT} />
        {body}
        {error && <p className='text-destructive text-sm'>{error}</p>}
        <ModalFooterActions
          rightActions={
            <>
              {step > 0 && (
                <Button
                  type='button'
                  variant='secondary'
                  disabled={isSubmitting}
                  onClick={() => setStep(step - 1)}
                >
                  Back
                </Button>
              )}
              {isLastStep ? (
                <Button
                  type='button'
                  loading={isSubmitting}
                  disabled={!canContinue || isSubmitting}
                  onClick={() => void handleFinish()}
                >
                  Finish
                </Button>
              ) : (
                <Button
                  type='button'
                  disabled={!canContinue}
                  onClick={() => setStep(step + 1)}
                >
                  Next
                </Button>
              )}
            </>
          }
        />
      </div>
    </Modal>
  );
}

export default SetupModal;

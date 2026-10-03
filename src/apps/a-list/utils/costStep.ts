import { fromDateInputValue } from '@/utils/dateInputUtils';
import { MAX_TAX_RATE } from '@apps/a-list/constants';
import { parseMoneyToCents } from '@apps/a-list/utils/money';
import { getTaxRateFromBill } from '@apps/a-list/utils/tax';

export interface CostStepValues {
  cost: string;
  billTotal: string;
  startDate: string;
  showBillTotal: boolean;
}

export const EMPTY_COST_STEP: CostStepValues = {
  cost: '',
  billTotal: '',
  startDate: '',
  showBillTotal: false,
};

interface CostStepResult {
  costCents: number | null;
  billTotalCents: number | null;
  taxRate: number | null;
  startDate: number | null;
  errors: { cost?: string; billTotal?: string; startDate?: string };
  isValid: boolean;
}

/** `todayDay` is the viewer's local today as UTC midnight, the same kind of value as the start date. */
export function evaluateCostStep(
  values: CostStepValues,
  todayDay: number,
): CostStepResult {
  const costCents = parseMoneyToCents(values.cost);
  const hasBillTotal = values.showBillTotal && values.billTotal.trim() !== '';
  const billTotalCents = hasBillTotal
    ? parseMoneyToCents(values.billTotal)
    : null;
  const startDate = fromDateInputValue(values.startDate) ?? null;
  const taxRate =
    costCents !== null &&
    costCents > 0 &&
    billTotalCents !== null &&
    billTotalCents >= costCents
      ? getTaxRateFromBill(costCents, billTotalCents)
      : null;

  const getCostError = () => {
    if (values.cost.trim() === '') return undefined;
    if (costCents === null) return 'Enter an amount like 25.99.';
    if (costCents <= 0) return 'Your membership has to cost something.';
    return undefined;
  };

  const getBillError = () => {
    if (!hasBillTotal) return undefined;
    if (billTotalCents === null) return 'Enter an amount like 27.94.';
    if (costCents !== null && billTotalCents < costCents) {
      return "A bill can't be lower than the cost before tax.";
    }
    if (taxRate !== null && taxRate > MAX_TAX_RATE) {
      return 'That works out to more than 25% tax. Double-check the total?';
    }
    return undefined;
  };

  const getStartDateError = () => {
    if (startDate === null) return undefined;
    if (startDate > todayDay)
      return "Pick today or a day you've already started.";
    return undefined;
  };

  const errors = {
    cost: getCostError(),
    billTotal: getBillError(),
    startDate: getStartDateError(),
  };
  const hasError = Object.values(errors).some(Boolean);
  const isValid =
    !hasError && costCents !== null && costCents > 0 && startDate !== null;

  return {
    costCents,
    billTotalCents: hasBillTotal ? billTotalCents : null,
    taxRate,
    startDate,
    errors,
    isValid,
  };
}

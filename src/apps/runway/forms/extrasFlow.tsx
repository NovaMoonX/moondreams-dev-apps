import AmountField from '@/components/AmountField';
import type { QuestionStep } from '@/hooks/useQuestionFlow';
import {
  centsToInputValue,
  formatCentsShort,
  parseMoneyToCents,
} from '@/utils/moneyUtils';
import { FORM_FLOW_WORDS } from '@apps/runway/constants';
import { canHaveExtras, getExtras } from '@apps/runway/engine/parts';
import {
  isText,
  readDraftFields,
  type Check,
} from '@apps/runway/forms/draftParse';
import {
  getFundingAmount,
  type FundingFormData,
} from '@apps/runway/forms/fundingFlow';
import { describeExtras } from '@apps/runway/utils/fundingText';
import type { FundingRule, Priority, PriorityExtra } from '@apps/runway/types';

type ExtraTier = Exclude<Priority, 'must'>;

/** Dollars as typed for each level below an item's own; empty for none. */
export interface ExtrasFormData {
  extras: Record<ExtraTier, string>;
}

export const INITIAL_EXTRAS_FORM: ExtrasFormData = {
  extras: { should: '', want: '' },
};

const TIERS_BELOW: Record<Priority, ExtraTier[]> = {
  must: ['should', 'want'],
  should: ['want'],
  want: [],
};

const TIER_FIELD_LABELS: Record<ExtraTier, string> = {
  should: FORM_FLOW_WORDS.extraAsShould,
  want: FORM_FLOW_WORDS.extraAsWant,
};

export const isExtrasAnswer: Check = (value) =>
  readDraftFields<ExtrasFormData['extras']>(value, {
    should: isText,
    want: isText,
  }) !== null;

/** A kept draft from before extras existed starts with none, so it still restores. */
export const withExtrasDefault = (stored: unknown) =>
  typeof stored === 'object' &&
  stored !== null &&
  !Array.isArray(stored) &&
  !('extras' in stored)
    ? { ...stored, extras: INITIAL_EXTRAS_FORM.extras }
    : stored;

export const toExtrasForm = (payload: {
  priority: Priority;
  orderIndex: number;
  funding: FundingRule;
  extras?: readonly PriorityExtra[] | null;
}): ExtrasFormData => ({
  extras: Object.fromEntries(
    TIERS_BELOW.must.map((tier) => [
      tier,
      centsToInputValue(
        getExtras(payload).find((extra) => extra.tier === tier)?.cents ?? null,
      ),
    ]),
  ) as ExtrasFormData['extras'],
});

const canAskForExtras = (data: FundingFormData, priority: Priority | null) =>
  priority !== null &&
  priority !== 'want' &&
  data.often !== 'none' &&
  getFundingAmount(data)?.kind === 'exact';

const isBadAmount = (text: string) =>
  text.trim() !== '' && !((parseMoneyToCents(text) ?? 0) > 0);

/** What stops the extras from being saved; null when there are none to ask or they are usable. */
export function getExtrasBlocker(
  data: FundingFormData & ExtrasFormData,
  priority: Priority | null,
) {
  if (!canAskForExtras(data, priority) || priority === null) return null;
  return TIERS_BELOW[priority].some((tier) => isBadAmount(data.extras[tier]))
    ? FORM_FLOW_WORDS.badAmount
    : null;
}

/** The extras to save: each level below the priority with an amount, or null when the rule or priority leaves none. */
export function buildExtras({
  data,
  priority,
  funding,
  saved,
  getNextRank,
}: {
  data: ExtrasFormData;
  priority: Priority;
  funding: FundingRule;
  saved: readonly PriorityExtra[] | null | undefined;
  getNextRank: (tier: Priority) => number;
}): PriorityExtra[] | null {
  if (!canHaveExtras(funding)) return null;
  const result = TIERS_BELOW[priority].flatMap((tier): PriorityExtra[] => {
    const cents = parseMoneyToCents(data.extras[tier]) ?? 0;
    if (cents <= 0) return [];
    const kept = saved?.find((extra) => extra.tier === tier);
    return [{ tier, cents, orderIndex: kept?.orderIndex ?? getNextRank(tier) }];
  });
  return result.length > 0 ? result : null;
}

/** The "extras" question, only where it can apply: an exact amount on a schedule, at Must or Should. */
export function buildExtrasSteps({
  data,
  priority,
  set,
}: {
  data: FundingFormData & ExtrasFormData;
  priority: Priority | null;
  set: (patch: Partial<ExtrasFormData>) => void;
}): QuestionStep[] {
  if (priority === null) return [];
  const isAsking = canAskForExtras(data, priority);
  const tiers = isAsking ? TIERS_BELOW[priority] : [];
  const toExtras = (list: readonly ExtraTier[]) =>
    list.flatMap((tier): PriorityExtra[] => {
      const cents = parseMoneyToCents(data.extras[tier]) ?? 0;
      return cents > 0 ? [{ tier, cents, orderIndex: 0 }] : [];
    });
  const chosen = toExtras(tiers);
  const dropped = toExtras(
    TIERS_BELOW.must.filter((tier) => !tiers.includes(tier)),
  );
  const getWhy = () => {
    if (isAsking) return FORM_FLOW_WORDS.extrasDroppedLevel;
    return priority === 'want'
      ? FORM_FLOW_WORDS.extrasDroppedWant
      : FORM_FLOW_WORDS.extrasDroppedAmount;
  };
  const droppedNote =
    dropped.length === 0
      ? null
      : FORM_FLOW_WORDS.extrasDropped(
          describeExtras(dropped, formatCentsShort).slice(2),
          getWhy(),
        );
  if (!isAsking) {
    return droppedNote === null
      ? []
      : [
          {
            id: 'extras',
            title: FORM_FLOW_WORDS.extrasTitle,
            summaryLabel: FORM_FLOW_WORDS.extras,
            summaryValue: droppedNote,
            isAnswered: true,
            isPreAnswered: true,
            render: () => (
              <p className='text-muted-foreground text-sm'>{droppedNote}</p>
            ),
          },
        ];
  }
  return [
    {
      id: 'extras',
      title: FORM_FLOW_WORDS.extrasTitle,
      summaryLabel: FORM_FLOW_WORDS.extras,
      summaryValue: [
        chosen.length === 0
          ? FORM_FLOW_WORDS.noExtras
          : describeExtras(chosen, formatCentsShort).slice(2),
        droppedNote,
      ]
        .filter(Boolean)
        .join('. '),
      isAnswered: !tiers.some((tier) => isBadAmount(data.extras[tier])),
      blocker: FORM_FLOW_WORDS.badAmount,
      isPreAnswered: true,
      render: () => (
        <div className='space-y-4'>
          {tiers.map((tier) => (
            <AmountField
              key={tier}
              emptyText={FORM_FLOW_WORDS.noExtras}
              label={TIER_FIELD_LABELS[tier]}
              value={data.extras[tier]}
              onChange={(value) =>
                set({ extras: { ...data.extras, [tier]: value } })
              }
            />
          ))}
          <p className='text-muted-foreground text-sm'>
            {FORM_FLOW_WORDS.extrasHint}
          </p>
          {droppedNote && (
            <p className='text-muted-foreground text-sm'>{droppedNote}</p>
          )}
        </div>
      ),
    },
  ];
}

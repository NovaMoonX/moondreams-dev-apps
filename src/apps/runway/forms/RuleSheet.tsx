import { useState } from 'react';

import { Button, Checkbox } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import DeleteIconButton from '@/components/DeleteIconButton';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import { useAuth } from '@/hooks/useAuth';
import { store, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  NEEDS_HOME_WORDS,
  RULE_WORDS,
  TICK_HIT_CLASS,
} from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  isBroadMerchant,
  RULE_VARIES,
  toMerchantKey,
} from '@apps/runway/engine/rules';
import { useRuleNames } from '@apps/runway/hooks/useRuleNames';
import { placingByHand } from '@apps/runway/hooks/useRuleMatch';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  assignPurchase,
  returnPurchaseToWaiting,
} from '@apps/runway/store/actions/purchaseActions';
import {
  createRule,
  deleteRule,
  updateRule,
} from '@apps/runway/store/actions/ruleActions';
import {
  selectEnvelopes,
  selectItemLooks,
  selectRules,
} from '@apps/runway/store/selectors/runwaySelectors';
import { getSpilledLines } from '@apps/runway/store/selectors/spillSelectors';
import type { OpenPurchase, OpenRule, RuleSealed } from '@apps/runway/types';
import { rankLikelyEnvelopes } from '@apps/runway/utils/likelyEnvelopes';
import { describePurchaseReturned } from '@apps/runway/utils/purchaseText';
import {
  describeRule,
  describeRulePlaced,
  getCategoryLabel,
} from '@apps/runway/utils/ruleText';

interface RuleSheetProps {
  /** The purchase a new rule is made from, which the rule also sends when it is still waiting in Needs a home; null when changing a rule. */
  purchase: OpenPurchase | null;
  /** The rule being changed; null when making one. */
  rule: OpenRule | null;
  onClose: () => void;
}

interface Facts {
  merchantKey: string | null;
  merchantName: string | null;
  category: string | null;
  cardId: string | null;
}

const getFacts = (
  purchase: OpenPurchase | null,
  rule: OpenRule | null,
): Facts =>
  purchase
    ? {
        merchantKey: toMerchantKey(purchase.merchant),
        merchantName: purchase.merchant?.trim() || null,
        category: purchase.category,
        cardId: purchase.paidByCardId ?? null,
      }
    : {
        merchantKey: rule?.merchantKey ?? null,
        merchantName: rule?.merchantName ?? null,
        category: rule?.category ?? null,
        cardId: rule?.cardId ?? null,
      };

/** Makes an always-do-this rule from a waiting purchase, or changes or removes one. */
function RuleSheet({ purchase, rule, onClose }: RuleSheetProps) {
  const { user } = useAuth();
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const { describe, getCardLabel, getEnvelopeName, isEnded } = useRuleNames();
  const rules = useAppSelector(selectRules);
  const history = useAppSelector((state) => state.runway.purchases);
  const envelopes = useAppSelector((state) =>
    selectEnvelopes(state, todayAsUtcDate()),
  );
  const looks = useAppSelector(selectItemLooks);
  const facts = getFacts(purchase, rule);
  const isBroad = isBroadMerchant(facts.merchantKey, rules);
  const hasMerchant = facts.merchantKey !== null;
  const hasKind = facts.category !== null && (rule !== null || !isBroad);
  const hasCard = facts.cardId !== null && getCardLabel(facts.cardId) !== null;

  const [ticks, setTicks] = useState(() => {
    if (rule) {
      return {
        merchant: rule.merchantKey !== null,
        kind: rule.category !== null,
        card: rule.cardId !== null,
      };
    }
    return {
      merchant: hasMerchant,
      kind: !hasMerchant && hasKind,
      card: !hasMerchant && !hasKind && hasCard,
    };
  });
  const likely = purchase
    ? (rankLikelyEnvelopes(
        purchase.merchant,
        history,
        envelopes.map(({ item }) => item.id),
        1,
      )[0] ?? null)
    : rule && !isEnded(rule)
      ? rule.target
      : null;
  const [picked, setPicked] = useState<string | null>(likely);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMerchantAlone = ticks.merchant && !ticks.kind && !ticks.card;
  const target = picked === RULE_VARIES && !isMerchantAlone ? null : picked;
  const draft: RuleSealed = {
    merchantKey: ticks.merchant ? facts.merchantKey : null,
    merchantName: ticks.merchant ? facts.merchantName : null,
    category: ticks.kind ? facts.category : null,
    cardId: ticks.card ? facts.cardId : null,
    target: target ?? '',
  };
  const hasCondition = ticks.merchant || ticks.kind || ticks.card;
  const blocker = !hasCondition
    ? RULE_WORDS.pickOne
    : target === null
      ? RULE_WORDS.pickEnvelope
      : null;
  const sentence = hasCondition
    ? `${describeRule(draft, {
        envelope:
          target === null ? RULE_WORDS.anEnvelope : getEnvelopeName(target),
        card: getCardLabel(draft.cardId),
      })}.`
    : '';

  const options = [
    ...envelopes.map(({ item }) => ({
      value: item.id,
      label: looks.get(item.id)?.name ?? '',
    })),
    ...(isMerchantAlone
      ? [{ value: RULE_VARIES, label: RULE_WORDS.askEvery }]
      : []),
  ];
  const nameOf = (envelopeId: string) =>
    looks.get(envelopeId)?.name ?? 'An envelope';

  const setTick = (name: 'merchant' | 'kind' | 'card', isOn: boolean) =>
    setTicks((current) =>
      name === 'merchant'
        ? {
            merchant: isOn,
            kind: isOn ? false : current.kind,
            card: isOn ? false : current.card,
          }
        : {
            ...current,
            merchant: isOn ? false : current.merchant,
            [name]: isOn,
          },
    );

  const sendThisOne = async (made: OpenRule) => {
    if (!user || !purchase?.needsHome || made.target === RULE_VARIES) return;
    const lines = getSpilledLines(
      store.getState(),
      [{ envelopeId: made.target, cents: purchase.amountCents, via: 'chosen' }],
      null,
      purchase.date,
    );
    const encryption = await getRunwayEncryption(user.uid);
    const updatedAt = await assignPurchase(
      user.uid,
      encryption,
      purchase,
      lines,
      describeRulePlaced(purchase, lines, nameOf, describe(made)),
      false,
      { ruleId: made.id, assignedBy: 'auto' },
    );
    const placed: OpenPurchase = {
      ...purchase,
      lines,
      needsHome: false,
      assignedBy: 'auto',
      ruleId: made.id,
      updatedAt,
    };
    addToast({
      title: RULE_WORDS.made,
      description: NEEDS_HOME_WORDS.sentTo(nameOf(made.target)),
      type: 'success',
      action: {
        label: RULE_WORDS.undo,
        onClick: () =>
          void returnPurchaseToWaiting(
            user.uid,
            encryption,
            placed,
            describePurchaseReturned(placed, nameOf),
            { ruleId: null, assignedBy: 'person' },
          ).catch((undoError: unknown) =>
            addToast({
              title: RULE_WORDS.undoFailed,
              description: getErrorMessage(undoError, ''),
              type: 'error',
            }),
          ),
      },
    });
  };

  const save = async () => {
    if (!user || isBusy || blocker !== null || target === null) return;
    setIsBusy(true);
    setError(null);
    const input = { ...draft, target };
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const entry = describe(input);
      if (rule) {
        await updateRule(
          user.uid,
          encryption,
          rule,
          input,
          RULE_WORDS.changeChanged(entry),
        );
        addToast({ title: RULE_WORDS.saved, type: 'success' });
        onClose();
        return;
      }
      if (purchase) placingByHand.add(purchase.id);
      const made = await createRule(
        user.uid,
        encryption,
        input,
        RULE_WORDS.changeMade(entry),
      );
      try {
        await sendThisOne(made);
      } catch (sendError) {
        addToast({
          title: RULE_WORDS.made,
          description: getErrorMessage(sendError, NEEDS_HOME_WORDS.failed),
          type: 'warning',
        });
      }
      if (made.target === RULE_VARIES || !purchase?.needsHome) {
        addToast({ title: RULE_WORDS.made, type: 'success' });
      }
      onClose();
    } catch (saveError) {
      setError(getErrorMessage(saveError, RULE_WORDS.saveFailed));
      setIsBusy(false);
    } finally {
      if (purchase) placingByHand.delete(purchase.id);
    }
  };

  const remove = async () => {
    if (!user || !rule || isBusy) return;
    const entry = describe(rule);
    const isConfirmed = await confirm({
      title: RULE_WORDS.removeConfirmTitle,
      message: RULE_WORDS.removeConfirm(entry),
      confirmText: RULE_WORDS.removeConfirmButton,
    });
    if (!isConfirmed) return;
    setIsBusy(true);
    setError(null);
    try {
      await deleteRule(
        user.uid,
        await getRunwayEncryption(user.uid),
        rule,
        RULE_WORDS.changeRemoved(entry),
      );
      addToast({ title: RULE_WORDS.removed, type: 'success' });
      onClose();
    } catch (removeError) {
      setError(getErrorMessage(removeError, RULE_WORDS.removeFailed));
      setIsBusy(false);
    }
  };

  const tickRows = [
    ...(hasMerchant
      ? [
          {
            name: 'merchant' as const,
            label: facts.merchantName ?? '',
            sub: RULE_WORDS.thisMerchantSub,
          },
        ]
      : []),
    ...(hasKind
      ? [
          {
            name: 'kind' as const,
            label: getCategoryLabel(facts.category ?? ''),
            sub: RULE_WORDS.thisKindSub,
          },
        ]
      : []),
    ...(hasCard
      ? [
          {
            name: 'card' as const,
            label: RULE_WORDS.thisCard(getCardLabel(facts.cardId) ?? ''),
            sub: RULE_WORDS.thisCardSub,
          },
        ]
      : []),
  ];

  return (
    <FormSheet
      isOpen
      isDrawerWhenShort
      onClose={onClose}
      title={rule ? RULE_WORDS.editTitle : RULE_WORDS.sheetTitle}
    >
      <div className='space-y-4 pb-4'>
        <div className='space-y-2'>
          <p className='text-sm font-medium'>{RULE_WORDS.question}</p>
          <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
            {tickRows.map(({ name, label, sub }) => (
              <li key={name}>
                <label className='flex min-h-14 items-center gap-3 px-3 py-2'>
                  <Checkbox
                    className={TICK_HIT_CLASS}
                    checked={ticks[name]}
                    onCheckedChange={(next) => setTick(name, Boolean(next))}
                  />
                  <span className='block min-w-0 flex-1 text-sm'>
                    <span className='line-clamp-2 font-medium break-words'>
                      {label}
                    </span>
                    <span className='text-muted-foreground line-clamp-2 break-words'>
                      {sub}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {hasMerchant && tickRows.length > 1 && (
            <p className='text-muted-foreground text-xs'>
              {RULE_WORDS.merchantAlone}
            </p>
          )}
        </div>
        <div className='space-y-2'>
          <p className='text-sm font-medium'>{RULE_WORDS.envelope}</p>
          <PillGroup
            label={RULE_WORDS.envelope}
            options={options}
            value={target}
            onChange={setPicked}
          />
        </div>
        {sentence !== '' && (
          <p className='text-sm' role='status'>
            {sentence}
          </p>
        )}
        {rule && isEnded(rule) && (
          <p className='text-muted-foreground text-sm'>
            {RULE_WORDS.endedEnvelope(getEnvelopeName(rule.target))}
          </p>
        )}
        {error && (
          <p className='text-destructive text-sm' role='alert'>
            {error}
          </p>
        )}
      </div>
      <ModalFooterActions
        note={blocker}
        leftActions={
          rule ? (
            <DeleteIconButton
              onClick={() => void remove()}
              disabled={isBusy}
              label={RULE_WORDS.remove}
            />
          ) : undefined
        }
        cancelAction={
          <Button
            type='button'
            variant='secondary'
            onClick={onClose}
            disabled={isBusy}
          >
            Cancel
          </Button>
        }
        rightActions={
          <Button
            type='button'
            disabled={blocker !== null || isBusy}
            onClick={() => void save()}
          >
            {purchase?.needsHome ? RULE_WORDS.saveAndSend : RULE_WORDS.save}
          </Button>
        }
      />
    </FormSheet>
  );
}

export default RuleSheet;

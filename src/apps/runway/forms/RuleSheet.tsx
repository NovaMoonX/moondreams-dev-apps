import { useState } from 'react';
import { Check } from 'lucide-react';

import { Button, Checkbox } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import BackLink from '@/components/BackLink';
import DeleteIconButton from '@/components/DeleteIconButton';
import FormSheet from '@/components/FormSheet';
import HelpTip from '@/components/HelpTip';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import { useAuth } from '@/hooks/useAuth';
import { store, useAppSelector } from '@/store';
import {
  RULE_WORDS,
  SPEND_WORDS,
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
  readPurchaseNow,
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
import type {
  OpenPurchase,
  OpenRule,
  RuleSealed,
  RunwayEncryption,
} from '@apps/runway/types';
import { rankLikelyEnvelopes } from '@apps/runway/utils/likelyEnvelopes';
import {
  describePurchaseReturned,
  getPurchaseTitle,
} from '@apps/runway/utils/purchaseText';
import {
  describeRule,
  describeRulePlaced,
  getCategoryLabel,
} from '@apps/runway/utils/ruleText';
import { UNDO_WINDOW_MS } from '@/lib/undo';

interface RuleSheetProps {
  purchase: OpenPurchase | null;
  rule: OpenRule | null;
  onClose: () => void;
  onBack?: () => void;
  stayName?: string | null;
  onDecline?: () => void;
}

interface Facts {
  merchantKey: string | null;
  merchantName: string | null;
  category: string | null;
  cardId: string | null;
}

const toRuleError = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : '';
  return message === RULE_WORDS.pickOne || message === RULE_WORDS.gone
    ? message
    : fallback;
};

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
function RuleSheet({
  purchase,
  rule,
  onClose,
  onBack,
  stayName = null,
  onDecline,
}: RuleSheetProps) {
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
  const [willSend] = useState(purchase?.needsHome ?? false);

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
  const sentence =
    hasCondition && target !== null
      ? `${describeRule(draft, {
          envelope: getEnvelopeName(target),
          card: getCardLabel(draft.cardId),
        })}.`
      : '';
  const isUnchanged =
    rule !== null &&
    draft.merchantKey === rule.merchantKey &&
    draft.category === rule.category &&
    draft.cardId === rule.cardId &&
    draft.target === rule.target;

  const options = [
    ...envelopes.map(({ item }) => ({
      value: item.id,
      label: looks.get(item.id)?.name ?? '',
    })),
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

  const toastPlaced = (
    uid: string,
    encryption: RunwayEncryption,
    placed: OpenPurchase,
    envelopeId: string,
  ) =>
    addToast({
      title: RULE_WORDS.made,
      description: RULE_WORDS.madeSent(
        getPurchaseTitle(placed, nameOf),
        nameOf(envelopeId),
      ),
      type: 'success',
      duration: UNDO_WINDOW_MS,
      action: {
        label: RULE_WORDS.undo,
        onClick: () =>
          void returnPurchaseToWaiting(
            uid,
            encryption,
            placed,
            describePurchaseReturned(placed, nameOf),
            { ruleId: null, assignedBy: 'person' },
          ).catch(() =>
            addToast({ title: RULE_WORDS.undoFailed, type: 'error' }),
          ),
      },
    });

  const sendThisOne = async (made: OpenRule) => {
    if (!user || !purchase || made.target === RULE_VARIES) return;
    const encryption = await getRunwayEncryption(user.uid);
    const toastStored = async (sendError: unknown) => {
      // The rule pass may have placed it first; what is stored now decides.
      const fresh = await readPurchaseNow(
        user.uid,
        encryption,
        purchase.id,
      ).catch(() => null);
      const home = fresh?.lines.find((line) => line.via === 'chosen');
      if (!fresh || fresh.ruleId === null || fresh.needsHome || !home) {
        throw sendError;
      }
      toastPlaced(user.uid, encryption, fresh, home.envelopeId ?? made.target);
    };
    if (!purchase.needsHome) {
      await toastStored(new Error(SPEND_WORDS.changedElsewhere)).catch(() =>
        addToast({ title: RULE_WORDS.made, type: 'success' }),
      );
      return;
    }
    const lines = getSpilledLines(
      store.getState(),
      [{ envelopeId: made.target, cents: purchase.amountCents, via: 'chosen' }],
      null,
      purchase.date,
    );
    try {
      const updatedAt = await assignPurchase(
        user.uid,
        encryption,
        purchase,
        lines,
        describeRulePlaced(purchase, lines, nameOf, describe(made)),
        false,
        { ruleId: made.id, assignedBy: 'auto' },
      );
      toastPlaced(
        user.uid,
        encryption,
        {
          ...purchase,
          lines,
          needsHome: false,
          assignedBy: 'auto',
          ruleId: made.id,
          updatedAt,
        },
        made.target,
      );
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : '';
      if (
        message !== SPEND_WORDS.changedElsewhere &&
        message !== SPEND_WORDS.notFound
      ) {
        throw sendError;
      }
      await toastStored(sendError);
    }
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
      if (made.target === RULE_VARIES || !willSend) {
        addToast({ title: RULE_WORDS.made, type: 'success' });
      } else {
        await sendThisOne(made).catch(() =>
          addToast({
            title: RULE_WORDS.made,
            description: RULE_WORDS.madeNotSent,
            type: 'warning',
          }),
        );
      }
      onClose();
    } catch (saveError) {
      setError(toRuleError(saveError, RULE_WORDS.saveFailed));
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
      setError(toRuleError(removeError, RULE_WORDS.removeFailed));
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
        {onBack && <BackLink onBack={onBack} />}
        {stayName !== null && (
          <p className='text-muted-foreground text-sm'>
            {RULE_WORDS.changesFuture(stayName)}
          </p>
        )}
        <div className='space-y-2'>
          <div className='flex items-center gap-2'>
            <p className='text-sm font-medium'>{RULE_WORDS.question}</p>
            {hasMerchant && tickRows.length > 1 && (
              <HelpTip title={RULE_WORDS.merchantAloneTitle}>
                {RULE_WORDS.merchantAlone}
              </HelpTip>
            )}
          </div>
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
        </div>
        <div className='space-y-2'>
          <p className='text-sm font-medium'>{RULE_WORDS.envelope}</p>
          <PillGroup
            label={RULE_WORDS.envelope}
            options={options}
            value={target}
            onChange={setPicked}
          />
          {isMerchantAlone && (
            <Button
              type='button'
              variant='tertiary'
              aria-pressed={picked === RULE_VARIES}
              className='border-border text-foreground! h-10 w-full justify-between! rounded-xl border text-sm font-normal'
              onClick={() => setPicked(RULE_VARIES)}
            >
              <span>{RULE_WORDS.askEvery}</span>
              {picked === RULE_VARIES && (
                <Check className='h-4 w-4' aria-hidden='true' />
              )}
            </Button>
          )}
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
          onBack && !onDecline ? undefined : (
            <Button
              type='button'
              variant='secondary'
              onClick={onDecline ?? onClose}
              disabled={isBusy}
            >
              {onDecline ? RULE_WORDS.notNow : 'Cancel'}
            </Button>
          )
        }
        rightActions={
          <Button
            type='button'
            className='whitespace-nowrap'
            disabled={blocker !== null || isBusy || isUnchanged}
            onClick={() => void save()}
          >
            {willSend ? RULE_WORDS.saveAndSend : RULE_WORDS.save}
          </Button>
        }
      />
    </FormSheet>
  );
}

export default RuleSheet;

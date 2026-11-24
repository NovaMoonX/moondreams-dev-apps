import { useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { LayoutGrid } from 'lucide-react';

import CoverShortfallSheet, {
  type CoverChoice,
} from '@apps/runway/components/CoverShortfallSheet';
import EnvelopePickSheet from '@apps/runway/components/EnvelopePickSheet';
import ItemRow from '@apps/runway/components/ItemRow';
import { useAuth } from '@/hooks/useAuth';
import { store, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatCents } from '@/utils/moneyUtils';
import {
  COVER_WORDS,
  NEEDS_HOME_WORDS,
  SPEND_WORDS,
} from '@apps/runway/constants';
import { splitAtShortfall } from '@apps/runway/engine/spill';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { useShortfallMove } from '@apps/runway/hooks/useShortfallMove';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { toMerchantKey } from '@apps/runway/engine/rules';
import { canOfferRule } from '@apps/runway/engine/matching';
import { isTrackingLevel } from '@apps/runway/engine/level';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  assignPurchase,
  readPurchaseNow,
  undoPlacement,
} from '@apps/runway/store/actions/purchaseActions';
import {
  selectEnvelopes,
  selectItemLooks,
} from '@apps/runway/store/selectors/runwaySelectors';
import {
  getPickEffect,
  getSpilledLines,
  type PickEffect,
} from '@apps/runway/store/selectors/spillSelectors';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import { selectLedgerOnlyBalances } from '@apps/runway/store/selectors/balanceSelectors';
import type { OpenPurchase, PurchaseLine } from '@apps/runway/types';
import { rankLikelyEnvelopes } from '@apps/runway/utils/likelyEnvelopes';
import { isRuleDeclined } from '@apps/runway/utils/ruleDeclined';
import {
  describePickEffect,
  describePurchaseAssigned,
  describeRunsOut,
  getPurchaseTitle,
} from '@apps/runway/utils/purchaseText';
import { UNDO_WINDOW_MS } from '@/lib/undo';

const LIKELY_SHOWN = 3;

interface NeedsHomeAssignProps {
  purchase: OpenPurchase;
  onDone: () => void;
  /** Called with the purchase as sent when the sheet should stay open to offer a rule for it (the third time in a row); then `onDone` is not called. */
  onSuggestRule?: (placed: OpenPurchase) => void;
}

/** The likeliest envelopes for an unplaced purchase, then every envelope; never a split. */
function NeedsHomeAssign({
  purchase,
  onDone,
  onSuggestRule,
}: NeedsHomeAssignProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const mask = useMaskedText();
  const today = todayAsUtcDate();
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const history = useAppSelector((state) => state.runway.purchases);
  const looks = useAppSelector(selectItemLooks);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const [asking, setAsking] = useState<{
    envelopeId: string;
    effect: PickEffect;
  } | null>(null);
  const moveShortfall = useShortfallMove();
  const effectOf = (envelopeId: string) =>
    getPickEffect(
      store.getState(),
      envelopeId,
      purchase.amountCents,
      null,
      purchase.date,
    );
  useAppSelector(selectLedgerOnlyBalances);

  const nameOf = (envelopeId: string) =>
    looks.get(envelopeId)?.name ?? 'An envelope';
  const likely = rankLikelyEnvelopes(
    purchase.merchant,
    history,
    envelopes.map(({ item }) => item.id),
    LIKELY_SHOWN,
  );

  const putBack = async (uid: string, sent: OpenPurchase) => {
    try {
      await undoPlacement(
        uid,
        await getRunwayEncryption(uid),
        sent,
        purchase,
        nameOf,
      );
      return true;
    } catch (undoError) {
      addToast({
        title: NEEDS_HOME_WORDS.undoFailed,
        description: getErrorMessage(undoError, ''),
        type: 'error',
      });
      return false;
    }
  };

  const send = (envelopeId: string) => {
    if (!user || busyId !== null) return;
    const effect = effectOf(envelopeId);
    if (effect.shortCents > 0) {
      setError(null);
      setAsking({ envelopeId, effect });
      return;
    }
    void commit(envelopeId, spilledFor(envelopeId), null);
  };

  const spilledFor = (envelopeId: string) =>
    getSpilledLines(
      store.getState(),
      [{ envelopeId, cents: purchase.amountCents, via: 'chosen' }],
      null,
      purchase.date,
    );

  const cover = async (choice: CoverChoice) => {
    if (!asking || busyId !== null) return;
    const { envelopeId } = asking;
    const effect = effectOf(envelopeId);
    if (effect.shortCents === 0 || choice === 'goOver') {
      await commit(envelopeId, spilledFor(envelopeId), null);
      return;
    }
    if (choice === 'useRest') {
      await commit(
        envelopeId,
        splitAtShortfall(envelopeId, purchase.amountCents, effect.shortCents),
        null,
      );
      return;
    }
    setBusyId(envelopeId);
    setError(null);
    const takeBack = await moveShortfall(
      envelopeId,
      effect.shortCents,
      nameOf(envelopeId),
    ).catch((moveError: unknown) => {
      setError(getErrorMessage(moveError, COVER_WORDS.moveFailed));
      setBusyId(null);
      return null;
    });
    if (takeBack === null) return;
    setBusyId(null);
    await commit(
      envelopeId,
      [{ envelopeId, cents: purchase.amountCents, via: 'chosen' }],
      { takeBack, cents: effect.shortCents },
    );
  };

  const commit = async (
    envelopeId: string,
    lines: PurchaseLine[],
    moved: { takeBack: () => Promise<unknown>; cents: number } | null,
  ) => {
    if (!user || busyId !== null) return;
    setBusyId(envelopeId);
    setError(null);
    try {
      const updatedAt = await assignPurchase(
        user.uid,
        await getRunwayEncryption(user.uid),
        purchase,
        lines,
        describePurchaseAssigned(purchase, lines, nameOf),
      );
      const placed = { ...purchase, lines, needsHome: false, updatedAt };
      setAsking(null);
      addToast({
        title: moved
          ? mask(
              COVER_WORDS.movedAndSent(
                formatCents(moved.cents),
                nameOf(envelopeId),
              ),
            )
          : NEEDS_HOME_WORDS.sentTo(nameOf(envelopeId)),
        type: 'success',
        duration: UNDO_WINDOW_MS,
        action: {
          label: NEEDS_HOME_WORDS.undo,
          onClick: () =>
            void putBack(user.uid, placed).then((isBack) =>
              isBack && moved ? moved.takeBack() : null,
            ),
        },
      });
      const merchantKey = toMerchantKey(purchase.merchant);
      const hasRule = store
        .getState()
        .runway.rules.some((rule) => rule.merchantKey === merchantKey);
      if (
        onSuggestRule &&
        isTrackingLevel(selectLevel(store.getState())) &&
        canOfferRule(placed) &&
        merchantKey !== null &&
        !hasRule &&
        !isRuleDeclined(user.uid, merchantKey)
      ) {
        onSuggestRule(placed);
      } else {
        onDone();
      }
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : '';
      if (
        message === SPEND_WORDS.changedElsewhere ||
        message === SPEND_WORDS.notFound
      ) {
        const fresh = await getRunwayEncryption(user.uid)
          .then((encryption) =>
            readPurchaseNow(user.uid, encryption, purchase.id),
          )
          .catch(() => null);
        const home = fresh?.lines.find((line) => line.via === 'chosen');
        if (
          fresh &&
          !fresh.needsHome &&
          fresh.ruleId !== null &&
          home?.envelopeId
        ) {
          addToast({
            title: NEEDS_HOME_WORDS.alreadySent(nameOf(home.envelopeId)),
            type: 'success',
            duration: UNDO_WINDOW_MS,
            action: {
              label: NEEDS_HOME_WORDS.undo,
              onClick: () => void putBack(user.uid, fresh),
            },
          });
          onDone();
          return;
        }
      }
      if (moved) void moved.takeBack();
      setError(getErrorMessage(sendError, NEEDS_HOME_WORDS.failed));
      setBusyId(null);
    }
  };

  if (envelopes.length === 0) return null;
  const otherLabel =
    likely.length > 0
      ? NEEDS_HOME_WORDS.otherEnvelope
      : NEEDS_HOME_WORDS.chooseEnvelope;
  return (
    <div className='space-y-2'>
      <p className='text-sm font-medium'>{NEEDS_HOME_WORDS.whichTitle}</p>
      <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
        {likely.map((id) => (
          <ItemRow
            key={id}
            name={nameOf(id)}
            emoji={looks.get(id)?.emoji ?? null}
            detailLead={describePickEffect(effectOf(id))}
            detail={
              describeRunsOut(effectOf(id).spillTo, nameOf) ??
              NEEDS_HOME_WORDS.sendHere
            }
            hiddenAriaLabel={`${nameOf(id)}, ${NEEDS_HOME_WORDS.sendHere}`}
            ariaLabel={`${nameOf(id)}, ${describePickEffect(effectOf(id)).text}, ${NEEDS_HOME_WORDS.sendHere}`}
            isAction
            onOpen={() => send(id)}
          />
        ))}
        <ItemRow
          leading={
            <span
              className='border-border bg-accent text-muted-foreground grid size-10 shrink-0 place-items-center rounded-xl border'
              aria-hidden='true'
            >
              <LayoutGrid className='h-5 w-5' />
            </span>
          }
          name={otherLabel}
          detail={NEEDS_HOME_WORDS.chooseEnvelopeSub}
          isPrivate={false}
          ariaLabel={`${otherLabel}, ${NEEDS_HOME_WORDS.chooseEnvelopeSub}`}
          onOpen={() => setIsPicking(true)}
        />
      </ul>
      {error && (
        <p className='text-destructive text-sm' role='alert'>
          {error}
        </p>
      )}
      {isPicking && (
        <EnvelopePickSheet
          subtitle={NEEDS_HOME_WORDS.pickFor(
            getPurchaseTitle(purchase, nameOf),
          )}
          effectOf={effectOf}
          onPick={(envelopeId) => {
            setIsPicking(false);
            send(envelopeId);
          }}
          onClose={() => setIsPicking(false)}
        />
      )}
      {asking && (
        <CoverShortfallSheet
          name={nameOf(asking.envelopeId)}
          leftCents={asking.effect.leftCents}
          shortCents={asking.effect.shortCents}
          isBusy={busyId !== null}
          error={error}
          onChoose={(choice) => void cover(choice)}
          onClose={() => {
            setAsking(null);
            setError(null);
          }}
        />
      )}
    </div>
  );
}

export default NeedsHomeAssign;

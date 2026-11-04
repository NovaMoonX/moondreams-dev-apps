import { useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import BackLink from '@/components/BackLink';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import { store } from '@/store';
import { formatCents } from '@/utils/moneyUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { ActionTitle } from '@apps/runway/components/ActionSection';
import EffectPreview from '@apps/runway/components/EffectPreview';
import { HORIZON_WORDS, PAY_SHARE_WORDS } from '@apps/runway/constants';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { changeItem } from '@apps/runway/store/actions/itemActions';
import type {
  ItemShortsReading,
  PreviewChange,
} from '@apps/runway/store/selectors/previewSelectors';
import { selectHorizonItems } from '@apps/runway/store/selectors/runwaySelectors';
import type { HorizonSealed } from '@apps/runway/types';

interface TakeFromPaysViewProps {
  itemId: string;
  horizon: HorizonSealed;
  today: number;
  onBack: () => void;
}

/** The view a Horizon item's sheet swaps in to take the rest from the person's pays: what that moves on each pay comes first, then the choice. */
function TakeFromPaysView({
  itemId,
  horizon,
  today,
  onBack,
}: TakeFromPaysViewProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changeJson = JSON.stringify({
    kind: 'version',
    version: {
      itemId,
      kind: 'horizon',
      effectiveFrom: today,
      effectiveUntil: null,
      changeId: 'what-if',
      payload: { ...horizon, rest: { kind: 'pays' } },
    },
  } satisfies PreviewChange);

  const getLive = () =>
    selectHorizonItems(store.getState(), today).find(
      ({ item }) => item.id === itemId,
    )?.version.payload ?? null;

  const write = (payload: HorizonSealed, summary: string) =>
    user
      ? getRunwayEncryption(user.uid).then((encryption) =>
          changeItem(user.uid, encryption, {
            itemId,
            kind: 'horizon',
            payload,
            summary,
            note: null,
            effectiveFrom: today,
          }),
        )
      : Promise.resolve();

  const save = async () => {
    if (isSaving) return;
    const live = getLive();
    if (!live || live.rest.kind !== 'later') {
      setError(HORIZON_WORDS.takeFromPaysMoved);
      return;
    }
    const before = live.rest;
    setError(null);
    setIsSaving(true);
    try {
      await write(
        { ...live, rest: { kind: 'pays' } },
        HORIZON_WORDS.takeFromPaysSummary(live.name),
      );
      addToast({
        title: HORIZON_WORDS.takeFromPaysDone(live.name),
        type: 'success',
        action: {
          label: PAY_SHARE_WORDS.undo,
          onClick: () => {
            const now = getLive();
            if (!now || now.rest.kind !== 'pays') {
              addToast({
                title: PAY_SHARE_WORDS.undoFailed,
                description: HORIZON_WORDS.takeFromPaysUndoMoved,
                type: 'error',
              });
              return;
            }
            void write(
              { ...now, rest: before },
              HORIZON_WORDS.takeFromPaysBackSummary(now.name),
            ).catch((undoError: unknown) =>
              addToast({
                title: PAY_SHARE_WORDS.undoFailed,
                description: getErrorMessage(undoError, ''),
                type: 'error',
              }),
            );
          },
        },
      });
      onBack();
    } catch (saveError) {
      setError(getErrorMessage(saveError, PAY_SHARE_WORDS.saveFailed));
    } finally {
      setIsSaving(false);
    }
  };

  const shortNote = useMemo(
    () => ({
      itemId,
      describe: ({
        carriedCents,
        askedCents,
        payCount,
        roomCount,
      }: ItemShortsReading) => {
        const left = Math.max(0, askedCents - carriedCents);
        return left === 0
          ? null
          : HORIZON_WORDS.takeFromPaysShort(
              formatCents(carriedCents),
              formatCents(askedCents),
              formatCents(left),
              roomCount,
              payCount,
            );
      },
    }),
    [itemId],
  );

  return (
    <div className='flex flex-1 flex-col gap-3 [&_.form-footer]:mt-auto'>
      <BackLink onBack={onBack} />
      <ActionTitle>{HORIZON_WORDS.takeFromPaysTitle(horizon.name)}</ActionTitle>
      <EffectPreview
        changeJson={changeJson}
        emptyText={HORIZON_WORDS.effectNone}
        shortNote={shortNote}
      />
      <ModalFooterActions
        note={error}
        cancelAction={
          <Button
            type='button'
            variant='secondary'
            onClick={onBack}
            disabled={isSaving}
          >
            Cancel
          </Button>
        }
        rightActions={
          <Button
            type='button'
            loading={isSaving}
            disabled={isSaving}
            onClick={() => void save()}
          >
            {HORIZON_WORDS.takeFromPaysConfirm}
          </Button>
        }
      />
    </div>
  );
}

export default TakeFromPaysView;

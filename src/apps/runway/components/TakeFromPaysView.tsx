import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import BackLink from '@/components/BackLink';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import { getErrorMessage } from '@/utils/errorUtils';
import { ActionTitle } from '@apps/runway/components/ActionSection';
import EffectPreview from '@apps/runway/components/EffectPreview';
import { HORIZON_WORDS, PAY_SHARE_WORDS } from '@apps/runway/constants';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { changeItem } from '@apps/runway/store/actions/itemActions';
import type { PreviewChange } from '@apps/runway/store/selectors/previewSelectors';
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

  const write = (rest: HorizonSealed['rest'], summary: string) =>
    user
      ? getRunwayEncryption(user.uid).then((encryption) =>
          changeItem(user.uid, encryption, {
            itemId,
            kind: 'horizon',
            payload: { ...horizon, rest },
            summary,
            note: null,
            effectiveFrom: today,
          }),
        )
      : Promise.resolve();

  const save = async () => {
    if (isSaving) return;
    setError(null);
    setIsSaving(true);
    try {
      await write(
        { kind: 'pays' },
        HORIZON_WORDS.takeFromPaysSummary(horizon.name),
      );
      addToast({
        title: HORIZON_WORDS.takeFromPaysDone(horizon.name),
        type: 'success',
        action: {
          label: PAY_SHARE_WORDS.undo,
          onClick: () =>
            void write(
              horizon.rest,
              HORIZON_WORDS.takeFromPaysBackSummary(horizon.name),
            ).catch((undoError: unknown) =>
              addToast({
                title: PAY_SHARE_WORDS.undoFailed,
                description: getErrorMessage(undoError, ''),
                type: 'error',
              }),
            ),
        },
      });
      onBack();
    } catch (saveError) {
      setError(getErrorMessage(saveError, PAY_SHARE_WORDS.saveFailed));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className='flex flex-1 flex-col gap-3 [&_.form-footer]:mt-auto'>
      <BackLink onBack={onBack} />
      <ActionTitle>{HORIZON_WORDS.takeFromPaysTitle(horizon.name)}</ActionTitle>
      <EffectPreview
        changeJson={changeJson}
        caption={HORIZON_WORDS.effectCaption}
        emptyText={HORIZON_WORDS.effectNone}
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

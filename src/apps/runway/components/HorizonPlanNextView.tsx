import { useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import BackLink from '@/components/BackLink';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import { store, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { generateUuid } from '@/utils/idUtils';
import { ActionTitle } from '@apps/runway/components/ActionSection';
import HorizonNextFields from '@apps/runway/components/HorizonNextFields';
import { HORIZON_END_WORDS, HORIZON_NEXT_WORDS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { findNextOf, getNextHorizon } from '@apps/runway/engine/horizon';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  planNextHorizon,
  undoPlanNextHorizon,
} from '@apps/runway/store/actions/horizonActions';
import {
  selectAllHorizonItems,
  selectCostPaid,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { HorizonSealed } from '@apps/runway/types';
import {
  makeNextDraft,
  readNextDraft,
} from '@apps/runway/utils/horizonNextDraft';
import { isOfflineFailure } from '@apps/runway/utils/offlineText';

interface HorizonPlanNextViewProps {
  itemId: string;
  horizon: HorizonSealed;
  today: number;
  onBack: () => void;
  onClose: () => void;
}

/** The view a finished or called-off event's sheet swaps in to plan the next one: when it will be, when saving starts and what each copied cost comes to. */
function HorizonPlanNextView({
  itemId,
  horizon,
  today,
  onBack,
  onClose,
}: HorizonPlanNextViewProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const paid = useAppSelector(selectCostPaid)[itemId] ?? [];
  const [draft, setDraft] = useState(() => makeNextDraft(horizon, paid, today));
  const [nextId] = useState(generateUuid);
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const { plan, blocker } = readNextDraft(draft, horizon, paid, today);

  const save = async () => {
    if (isSavingRef.current || !user || plan === null || blocker !== null)
      return;
    if (!navigator.onLine) {
      setError(HORIZON_END_WORDS.offline);
      return;
    }
    const { items, versions, moves } = store.getState().runway;
    const found =
      selectAllHorizonItems(store.getState(), todayAsUtcDate()).find(
        ({ item }) => item.id === itemId,
      )?.version ?? null;
    if (found === null || found.payload.state === 'open') {
      setError(HORIZON_NEXT_WORDS.changedFirst);
      return;
    }
    if (
      findNextOf(
        itemId,
        horizon.stateMoney?.moveId ?? null,
        items,
        versions,
        moves,
      )
    ) {
      setError(HORIZON_NEXT_WORDS.alreadyPlanned);
      return;
    }
    const next = getNextHorizon(horizon, paid, itemId, plan);
    isSavingRef.current = true;
    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const written = await planNextHorizon(user.uid, encryption, {
        fromId: itemId,
        nextId,
        horizon: next,
        from: found.payload,
        baseVersionId: found.id,
        today: todayAsUtcDate(),
      });
      if (written === null) {
        setError(HORIZON_NEXT_WORDS.changedFirst);
        return;
      }
      addToast({
        title: HORIZON_NEXT_WORDS.planned(horizon.name),
        type: 'success',
        action: {
          label: HORIZON_END_WORDS.undo,
          onClick: () =>
            void undoPlanNextHorizon(user.uid, encryption, {
              fromId: itemId,
              nextId,
              versionId: written.versionId,
              horizon: next,
              today: todayAsUtcDate(),
            })
              .then((isUndone) =>
                addToast(
                  isUndone
                    ? {
                        title: HORIZON_NEXT_WORDS.undoPlanned(horizon.name),
                        type: 'success',
                      }
                    : { title: HORIZON_END_WORDS.changedSince, type: 'error' },
                ),
              )
              .catch((undoError: unknown) =>
                addToast({
                  title: HORIZON_NEXT_WORDS.changedSince,
                  description: getErrorMessage(
                    undoError,
                    HORIZON_END_WORDS.failed,
                  ),
                  type: 'error',
                }),
              ),
        },
      });
      onClose();
    } catch (saveError) {
      setError(
        isOfflineFailure(saveError)
          ? HORIZON_END_WORDS.offline
          : getErrorMessage(saveError, HORIZON_NEXT_WORDS.planFailed),
      );
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  return (
    <div className='flex flex-1 flex-col gap-4 [&_.form-footer]:mt-auto'>
      <BackLink onBack={onBack} />
      <ActionTitle>{HORIZON_NEXT_WORDS.title}</ActionTitle>
      <HorizonNextFields
        horizon={horizon}
        paid={paid}
        draft={draft}
        onChange={setDraft}
        today={today}
        isDisabled={isSaving}
      />
      <ModalFooterActions
        note={error ?? blocker}
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
            className='whitespace-nowrap max-sm:px-3'
            loading={isSaving}
            disabled={isSaving || plan === null || blocker !== null}
            onClick={() => void save()}
          >
            {HORIZON_NEXT_WORDS.planConfirm}
          </Button>
        }
      />
    </div>
  );
}

export default HorizonPlanNextView;

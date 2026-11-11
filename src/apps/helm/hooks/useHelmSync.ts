import { useEffect, useRef } from 'react';

import { syncConnections } from '@/lib/connections/connectionCalls';
import { useConnections } from '@/lib/connections/useConnections';
import { setSiteNotice } from '@/hooks/useSiteNotice';
import { useAppDispatch, useAppSelector } from '@/store';
import { formatDateShort, formatTime } from '@/utils/formatUtils';
import { unlockSealedFormDrafts } from '@lib/app/formDrafts';
import { createSealedReader } from '@lib/security';
import {
  clearHelmKey,
  getHelmEncryption,
  isKeptKey,
  readServerReachedAt,
} from '@apps/helm/queries/helmKeyQueries';
import {
  createDraftSealer,
  HELM_DRAFT_PREFIX,
  openJson,
} from '@apps/helm/security';
import { useStyleLearning } from '@apps/helm/queries/styleLearning';
import { ensureHelmProfile } from '@apps/helm/store/actions/settingsActions';
import { ensureSelfWho } from '@apps/helm/store/actions/whoActions';
import {
  clearHelm,
  retryKey,
  setFacts,
  setFactsFailed,
  setStyle,
  setStyleFailed,
  setKeyDateIndex,
  setKeyDateIndexFailed,
  setKeyStatus,
  setPlaces,
  setPlacesFailed,
  setProjectTasks,
  setProjectTasksFailed,
  setProjects,
  setProjectsFailed,
  setNotes,
  setNotesFailed,
  setTopics,
  setTopicsFailed,
  setProcedures,
  setProceduresFailed,
  setOpenRuns,
  setOpenRunsFailed,
  setMedia,
  setMediaFailed,
  setWho,
  setWhoFailed,
  setOpenTasks,
  setOpenTasksFailed,
  setPlanDays,
  setPlanDaysFailed,
  setProfile,
  setRecentCaptures,
  setRecentCapturesFailed,
  setRecentExecutions,
  setRecentExecutionsFailed,
  setSynced,
  setSyncedFailed,
  setUnseenCaptures,
  setUnseenCapturesFailed,
  setWaitingCaptures,
  setWaitingCapturesFailed,
} from '@apps/helm/store/helmSlice';
import {
  startRecentCapturesListener,
  startUnseenCapturesListener,
  startWaitingCapturesListener,
} from '@apps/helm/store/listeners/captureListener';
import { startRecentExecutionsListener } from '@apps/helm/store/listeners/executionListener';
import { startStyleListener } from '@apps/helm/store/listeners/styleListener';
import { startFactsListener } from '@apps/helm/store/listeners/factListener';
import { startKeyDateIndexListener } from '@apps/helm/store/listeners/keyDateIndexListener';
import { sweepExpiredMedia } from '@apps/helm/store/actions/mediaActions';
import { startMediaListener } from '@apps/helm/store/listeners/mediaListener';
import { startPlacesListener } from '@apps/helm/store/listeners/placeListener';
import { startNotesListener } from '@apps/helm/store/listeners/noteListener';
import { startProjectsListener } from '@apps/helm/store/listeners/projectListener';
import { startProceduresListener } from '@apps/helm/store/listeners/procedureListener';
import { startOpenRunsListener } from '@apps/helm/store/listeners/runListener';
import { startTopicsListener } from '@apps/helm/store/listeners/topicListener';
import { startWhoListener } from '@apps/helm/store/listeners/whoListener';
import { startSyncedListener } from '@apps/helm/store/listeners/syncedListener';
import { startPlanDaysListener } from '@apps/helm/store/listeners/planDayListener';
import { startProfileListener } from '@apps/helm/store/listeners/profileListener';
import {
  startOpenTasksListener,
  startProjectTasksListener,
} from '@apps/helm/store/listeners/taskListener';
import { useCaptureOutbox } from '@apps/helm/hooks/useCaptureOutbox';
import { useCaptureSweep } from '@apps/helm/hooks/useCaptureSweep';
import { useKeyDateRepair } from '@apps/helm/hooks/useKeyDateRepair';
import { usePlanOnCapture } from '@apps/helm/hooks/usePlanDays';
import { HELM_COPY, SYNC_REFRESH_MS } from '@apps/helm/constants';
import { getRecentWindowStart } from '@apps/helm/utils/sessions';
import { getPlanDaysWindow } from '@apps/helm/utils/planDays';
import { isDueForRefresh } from '@apps/helm/utils/synced';

const OFFLINE_CODES = ['functions/unavailable', 'functions/deadline-exceeded'];

const isOfflineError = (error: unknown) =>
  !navigator.onLine ||
  (error instanceof Error &&
    'code' in error &&
    OFFLINE_CODES.includes(String(error.code)));

/** Asks the platform to update the connections that are due, on open and on coming back to the tab, at most once per window; never offline. */
function useConnectionsRefresh(uid: string | null) {
  const { grants, isKnown } = useConnections({ readerAppId: 'helm' });
  const lastAskedAt = useRef(0);
  const isAsking = useRef(false);

  useEffect(() => {
    if (!uid || !isKnown) return;
    const ask = () => {
      const now = Date.now();
      if (
        document.visibilityState !== 'visible' ||
        !navigator.onLine ||
        isAsking.current ||
        now - lastAskedAt.current < SYNC_REFRESH_MS ||
        !grants.some((grant) => isDueForRefresh(grant, now))
      )
        return;
      isAsking.current = true;
      syncConnections({})
        .then(() => {
          lastAskedAt.current = now;
        })
        .catch((error: unknown) =>
          console.error('Helm connections were not updated', error),
        )
        .finally(() => {
          isAsking.current = false;
        });
    };
    ask();
    document.addEventListener('visibilitychange', ask);
    window.addEventListener('online', ask);
    return () => {
      document.removeEventListener('visibilitychange', ask);
      window.removeEventListener('online', ask);
    };
  }, [uid, isKnown, grants]);
}

/** Makes the person's own who once the key is here and the profile has loaded without one; offline it is tried again when the device is back. */
function useSelfWho(uid: string | null, displayName: string | null) {
  const keyStatus = useAppSelector((state) => state.helm.keyStatus);
  const hasNoSelf = useAppSelector(
    (state) =>
      state.helm.uid === uid &&
      state.helm.profile !== null &&
      state.helm.profile.selfWhoId === null,
  );
  const isMaking = useRef(false);
  const trimmed = displayName?.trim() ?? '';
  const name =
    trimmed && !trimmed.includes('@') ? trimmed : HELM_COPY.selfFallbackName;

  useEffect(() => {
    if (!uid || keyStatus !== 'ready' || !hasNoSelf) return;
    const make = () => {
      if (isMaking.current) return;
      isMaking.current = true;
      getHelmEncryption(uid)
        .then((encryption) =>
          isKeptKey(encryption)
            ? undefined
            : ensureSelfWho(uid, encryption, name),
        )
        .catch((error: unknown) =>
          console.error('Helm could not make the person', error),
        )
        .finally(() => {
          isMaking.current = false;
        });
    };
    make();
    window.addEventListener('online', make);
    return () => window.removeEventListener('online', make);
  }, [uid, keyStatus, hasNoSelf, name]);
}

const formatKeptAt = (at: number | null) => {
  if (at === null) return null;
  const isToday = new Date(at).toDateString() === new Date().toDateString();
  return isToday ? formatTime(at) : formatDateShort(at);
};

/** Keeps the signed-in person's Helm profile in the store and makes it the first time they open Helm; once the data key is here, keeps their turns there too. */
export function useHelmSync(uid: string | null, displayName: string | null) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!uid) return;

    let isCurrent = true;
    const stops: (() => void)[] = [];
    stops.push(
      startProfileListener(
        uid,
        (profile) => {
          if (isCurrent) dispatch(setProfile({ uid, profile }));
        },
        (error) => console.error('Helm profile listener failed', error),
      ),
    );
    return () => {
      isCurrent = false;
      stops.forEach((stop) => stop());
      dispatch(clearHelm());
    };
  }, [uid, dispatch]);

  useCaptureSweep(uid);
  useCaptureOutbox(uid);
  usePlanOnCapture(uid);
  useConnectionsRefresh(uid);
  useSelfWho(uid, displayName);
  useKeyDateRepair(uid);
  useStyleLearning(uid);

  const keyAttempt = useAppSelector((state) => state.helm.keyAttempt);

  useEffect(() => {
    if (!uid) return;

    let isCurrent = true;
    const stops: (() => void)[] = [];
    const retryOnline = () => dispatch(retryKey());

    getHelmEncryption(uid)
      .then(async (encryption) => {
        if (!isCurrent) return;
        // Drafts open before the field mounts, so what was typed is there when it does.
        await unlockSealedFormDrafts(
          uid,
          HELM_DRAFT_PREFIX,
          createDraftSealer(encryption),
        );
        if (!isCurrent) return;
        const isKept = isKeptKey(encryption);
        // A kept copy only opens what is here and asks the server again once online; only the server's key starts a profile.
        if (isKept) {
          window.addEventListener('online', retryOnline);
          setSiteNotice({
            label: HELM_COPY.keptCopyNotice(
              formatKeptAt(readServerReachedAt(uid)),
            ),
            actionLabel: HELM_COPY.keptCopyRetry,
            onAction: retryOnline,
          });
        } else {
          void ensureHelmProfile(uid).catch((error: unknown) =>
            console.error('Helm profile was not created', error),
          );
        }
        dispatch(setKeyStatus('ready'));
        const read = createSealedReader(encryption, openJson);
        stops.push(
          startRecentCapturesListener(
            uid,
            read,
            getRecentWindowStart(Date.now()),
            (captures) => dispatch(setRecentCaptures(captures)),
            (error) => {
              console.error('Helm turns listener failed', error);
              dispatch(setRecentCapturesFailed());
            },
          ),
          startUnseenCapturesListener(
            uid,
            read,
            (captures) => dispatch(setUnseenCaptures(captures)),
            (error) => {
              console.error('Helm unseen turns listener failed', error);
              dispatch(setUnseenCapturesFailed());
            },
          ),
          startWaitingCapturesListener(
            uid,
            read,
            (captures) => dispatch(setWaitingCaptures(captures)),
            (error) => {
              console.error('Helm waiting turns listener failed', error);
              dispatch(setWaitingCapturesFailed());
            },
          ),
          startOpenTasksListener(
            uid,
            read,
            (tasks) => dispatch(setOpenTasks(tasks)),
            (error) => {
              console.error('Helm tasks listener failed', error);
              dispatch(setOpenTasksFailed());
            },
          ),
          startProjectTasksListener(
            uid,
            read,
            (tasks) => dispatch(setProjectTasks(tasks)),
            (error) => {
              console.error('Helm project tasks listener failed', error);
              dispatch(setProjectTasksFailed());
            },
          ),
          startPlanDaysListener(
            uid,
            read,
            getPlanDaysWindow(Date.now()),
            (days) => dispatch(setPlanDays(days)),
            (error) => {
              console.error('Helm plan days listener failed', error);
              dispatch(setPlanDaysFailed());
            },
          ),
          startFactsListener(
            uid,
            read,
            (facts) => dispatch(setFacts(facts)),
            (error) => {
              console.error('Helm facts listener failed', error);
              dispatch(setFactsFailed());
            },
          ),
          startStyleListener(
            uid,
            read,
            (style) => dispatch(setStyle(style)),
            (error) => {
              console.error('Helm writing style listener failed', error);
              dispatch(setStyleFailed());
            },
          ),
          startWhoListener(
            uid,
            read,
            (who) => dispatch(setWho(who)),
            (error) => {
              console.error('Helm people listener failed', error);
              dispatch(setWhoFailed());
            },
          ),
          startKeyDateIndexListener(
            uid,
            read,
            (index) => dispatch(setKeyDateIndex(index)),
            (error) => {
              console.error('Helm dates listener failed', error);
              dispatch(setKeyDateIndexFailed());
            },
          ),
          startPlacesListener(
            uid,
            read,
            (places) => dispatch(setPlaces(places)),
            (error) => {
              console.error('Helm places listener failed', error);
              dispatch(setPlacesFailed());
            },
          ),
          startProjectsListener(
            uid,
            read,
            (projects) => dispatch(setProjects(projects)),
            (error) => {
              console.error('Helm projects listener failed', error);
              dispatch(setProjectsFailed());
            },
          ),
          startNotesListener(
            uid,
            read,
            (notes) => dispatch(setNotes(notes)),
            (error) => {
              console.error('Helm notes listener failed', error);
              dispatch(setNotesFailed());
            },
          ),
          startTopicsListener(
            uid,
            read,
            (topics) => dispatch(setTopics(topics)),
            (error) => {
              console.error('Helm topics listener failed', error);
              dispatch(setTopicsFailed());
            },
          ),
          startProceduresListener(
            uid,
            read,
            (procedures) => dispatch(setProcedures(procedures)),
            (error) => {
              console.error('Helm procedures listener failed', error);
              dispatch(setProceduresFailed());
            },
          ),
          startOpenRunsListener(
            uid,
            read,
            (runs) => dispatch(setOpenRuns(runs)),
            (error) => {
              console.error('Helm runs listener failed', error);
              dispatch(setOpenRunsFailed());
            },
          ),
          startMediaListener(
            uid,
            read,
            (media) => {
              dispatch(setMedia(media));
              void sweepExpiredMedia(uid, media, Date.now());
            },
            (error) => {
              console.error('Helm photos listener failed', error);
              dispatch(setMediaFailed());
            },
          ),
          startSyncedListener(
            uid,
            read,
            (records) => dispatch(setSynced(records)),
            (error) => {
              console.error('Helm synced things listener failed', error);
              dispatch(setSyncedFailed());
            },
          ),
          startRecentExecutionsListener(
            uid,
            read,
            getRecentWindowStart(Date.now()),
            (executions) => dispatch(setRecentExecutions(executions)),
            (error) => {
              console.error('Helm activity listener failed', error);
              dispatch(setRecentExecutionsFailed());
            },
          ),
        );
      })
      .catch((error: unknown) => {
        // A cleanup that clears the key cancels its fetch; that is not a failure.
        if (!isCurrent) return;
        console.error('Helm could not get its key', error);
        dispatch(setKeyStatus(isOfflineError(error) ? 'offline' : 'failed'));
        // A dropped connection can read as a server failure, so both ask again once the device is back online.
        window.addEventListener('online', retryOnline);
      });

    return () => {
      isCurrent = false;
      window.removeEventListener('online', retryOnline);
      setSiteNotice(null);
      stops.forEach((stop) => stop());
      clearHelmKey();
    };
  }, [uid, keyAttempt, dispatch]);
}

import { useEffect } from 'react';

import { useNow } from '@/hooks/useNow';
import { useIsGateOpen } from '@/hooks/useFeatureGates';
import { EMAIL_PURCHASES_GATE_ID } from '@apps/runway/constants';
import {
  startEmailEventsListener,
  startEmailFiltersListener,
  startEmailIntakeListener,
} from '@apps/runway/store/listeners/emailListeners';

import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import {
  getChangeWindow,
  toChangeWindowKey,
} from '@apps/runway/utils/changeWindow';
import { startChangesListener } from '@apps/runway/store/listeners/changeListeners';
import { store, useAppDispatch, useAppSelector } from '@/store';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { unlockSealedFormDrafts } from '@lib/app/formDrafts';
import { DONE_FOR_YOU_WORDS, FORM_DRAFT_PREFIX } from '@apps/runway/constants';
import {
  getRunwayEncryption,
  isKeptKey,
} from '@apps/runway/queries/runwayKeyQueries';
import { createDraftSealer } from '@apps/runway/security';
import {
  ensurePlan,
  isPlanCached,
  setPlanTimeZone,
} from '@apps/runway/store/actions/planActions';
import {
  startItemsListener,
  startVersionsListener,
} from '@apps/runway/store/listeners/itemListeners';
import {
  startDaysListener,
  startRecordsListener,
} from '@apps/runway/store/listeners/dayListeners';
import { startAccountsListener } from '@apps/runway/store/listeners/accountListeners';
import {
  startAccountBalancesListener,
  startCardStatementsListener,
  startStartedPaymentsListener,
  startLinksListener,
} from '@apps/runway/store/listeners/linkListeners';
import { startCardsListener } from '@apps/runway/store/listeners/cardListeners';
import { startExpensesListener } from '@apps/runway/store/listeners/expenseListeners';
import { startDoneForYouListener } from '@apps/runway/store/listeners/doneForYouListeners';
import { startMemoriesListener } from '@apps/runway/store/listeners/memoryListeners';
import {
  startAlertsListener,
  startAlertStatesListener,
} from '@apps/runway/store/listeners/alertListeners';
import { startRulesListener } from '@apps/runway/store/listeners/ruleListeners';
import { startMovesListener } from '@apps/runway/store/listeners/moveListeners';
import { getSpendRange } from '@apps/runway/utils/spendPeriod';
import { toSubject } from '@apps/runway/utils/doneForYouSubject';
import {
  getDayKeyMonth,
  getHistoryRange,
} from '@apps/runway/utils/historyWindow';
import { getMonthStart } from '@apps/runway/engine/closings';
import {
  startNeedsHomeListener,
  startPurchasesListener,
} from '@apps/runway/store/listeners/purchaseListeners';
import { startClosingListener } from '@apps/runway/store/listeners/closingListeners';
import { startPlanListener } from '@apps/runway/store/listeners/planListener';
import { startFiguresListener } from '@apps/runway/store/listeners/figuresListener';
import { readLastWriteAt } from '@apps/runway/utils/figuresSnapshot';
import { recordDone } from '@apps/runway/hooks/useDoneForYou';
import { endItem } from '@apps/runway/store/actions/itemActions';
import {
  selectRecentFrom,
  toClosingKey,
} from '@apps/runway/store/selectors/historySelectors';
import { selectEmailIntakeAttempt } from '@apps/runway/store/selectors/emailSelectors';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import {
  selectConfirmedDayIds,
  selectIsDaysLoaded,
  selectIsLedgerReady,
  selectIsPlanItemsLoaded,
  selectItemLooks,
  selectLinkHistoryRanges,
  selectReachedEndingsKey,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenPurchase } from '@apps/runway/types';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import {
  setChanges,
  setChangesFailed,
  setCards,
  setLinks,
  setNeedsHome,
  setAccountBalances,
  setCardStatements,
  setStartedPayments,
  setAccounts,
  setExpenses,
  setRules,
  setMemories,
  setDoneForYou,
  setAlerts,
  setAlertStates,
  setEmailIntake,
  setIsEmailIntakeLoaded,
  setIsEmailIntakeFailed,
  setEmailEvents,
  setEmailFilters,
  setClosing,
  setDays,
  setItems,
  setKeyStatus,
  setMatchKeys,
  setLoadDay,
  setMoves,
  clearHistory,
  clearPeriodPurchases,
  setHistoryDays,
  setHistoryFailed,
  setHistoryRecords,
  setLinkHistoryPurchases,
  setPeriodFailed,
  setPeriodPurchases,
  setPlan,
  endHeadStart,
  setFiguresSnapshot,
  startHeadStart,
  setPurchases,
  setRecords,
  setVersions,
} from '@apps/runway/store/runwaySlice';

const zoneSent = new Set<string>();

/**
 * Opens the plan: fetches the data key, creates the plan on first open, then
 * listens to it. `attempt` restarts it after a failure.
 */
export function useRunwaySync(uid: string | null, attempt: number) {
  const dispatch = useAppDispatch();
  const today = todayAsUtcDate(useNow(60_000));
  const keyStatus = useAppSelector((state) => state.runway.keyStatus);
  const confirmedDayIds = useAppSelector(selectConfirmedDayIds);
  const isItemsLoaded = useAppSelector(selectIsPlanItemsLoaded);
  const isDaysLoaded = useAppSelector(selectIsDaysLoaded);
  const isPlanLoaded = isItemsLoaded && isDaysLoaded;
  const recentFrom = useAppSelector(selectRecentFrom);
  const closingKey = useAppSelector((state) =>
    toClosingKey(state.runway.plan?.dirtyFrom ?? null),
  );
  const reachedEndings = useAppSelector((state) =>
    selectReachedEndingsKey(state, today),
  );
  const isLedgerReady = useAppSelector(selectIsLedgerReady);
  const isHeadStartOver = useAppSelector(
    (state) => state.runway.isHeadStartOver,
  );
  const isPlanOpen = useAppSelector((state) => state.runway.plan !== null);
  const savedZone = useAppSelector(
    (state) => state.runway.plan?.timeZone ?? null,
  );

  useEffect(() => {
    if (!uid) return;
    const run = { isCurrent: true };

    getRunwayEncryption(uid)
      .then(async (encryption) => {
        void unlockSealedFormDrafts(
          uid,
          FORM_DRAFT_PREFIX,
          createDraftSealer(encryption),
        );
        // The device's copy of the key opens a plan already saved here; only the server's key creates one.
        if (!isKeptKey(encryption)) {
          await ensurePlan(uid, encryption);
        } else if (!(await isPlanCached(uid))) {
          throw new Error('No saved plan to open offline.');
        }
        if (!run.isCurrent) return;
        dispatch(setLoadDay(todayAsUtcDate()));
        dispatch(setKeyStatus('ready'));
      })
      .catch(() => {
        if (run.isCurrent) dispatch(setKeyStatus('failed'));
      });

    return () => {
      run.isCurrent = false;
    };
  }, [uid, attempt, dispatch]);

  useEffect(() => {
    if (!uid) return;
    dispatch(startHeadStart(readLastWriteAt(uid)));
  }, [uid, dispatch]);

  useEffect(() => {
    if (isLedgerReady) dispatch(endHeadStart());
  }, [isLedgerReady, dispatch]);

  useEffect(() => {
    if (!uid || keyStatus !== 'ready' || isLedgerReady || isHeadStartOver)
      return;

    const stop: { current: (() => void) | null } = { current: null };
    const run = { isCurrent: true };

    getRunwayEncryption(uid)
      .then((encryption) => {
        if (!run.isCurrent) return;
        stop.current = startFiguresListener(uid, encryption, (snapshot) =>
          dispatch(setFiguresSnapshot(snapshot)),
        );
      })
      .catch(() => undefined);

    return () => {
      run.isCurrent = false;
      stop.current?.();
    };
  }, [uid, keyStatus, isLedgerReady, isHeadStartOver, dispatch]);

  useEffect(() => {
    if (!uid || keyStatus !== 'ready' || !isPlanOpen) return;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone || zone === savedZone || zoneSent.has(uid)) return;
    zoneSent.add(uid);
    getRunwayEncryption(uid)
      .then((encryption) => setPlanTimeZone(uid, encryption, zone))
      .catch(() => {
        zoneSent.delete(uid);
      });
  }, [uid, keyStatus, isPlanOpen, savedZone]);

  useEffect(() => {
    if (!uid || keyStatus !== 'ready') return;

    const stops: { current: (() => void)[] } = { current: [] };
    const run = { isCurrent: true };

    getRunwayEncryption(uid).then((encryption) => {
      if (!run.isCurrent) return;
      const fail = () => dispatch(setKeyStatus('failed'));
      stops.current = [
        startPlanListener(
          uid,
          encryption,
          (plan) => dispatch(setPlan(plan)),
          fail,
        ),
        startItemsListener(
          uid,
          encryption,
          (items) => dispatch(setItems(items)),
          (keys) => dispatch(setMatchKeys(keys)),
          fail,
        ),
        startVersionsListener(
          uid,
          encryption,
          (versions) => dispatch(setVersions(versions)),
          fail,
        ),
        startCardsListener(
          uid,
          encryption,
          (cards) => dispatch(setCards(cards)),
          fail,
        ),
        startAccountsListener(
          uid,
          encryption,
          (accounts) => dispatch(setAccounts(accounts)),
          fail,
        ),
        startLinksListener(
          uid,
          encryption,
          (links) => dispatch(setLinks(links)),
          fail,
        ),
        startAccountBalancesListener(
          uid,
          encryption,
          (balances) => dispatch(setAccountBalances(balances)),
          fail,
        ),
        startCardStatementsListener(
          uid,
          encryption,
          (statements) => dispatch(setCardStatements(statements)),
          fail,
        ),
        startStartedPaymentsListener(
          uid,
          encryption,
          (payments) => dispatch(setStartedPayments(payments)),
          fail,
        ),
        startExpensesListener(
          uid,
          encryption,
          (expenses) => dispatch(setExpenses(expenses)),
          fail,
        ),
        startRulesListener(
          uid,
          encryption,
          (rules) => dispatch(setRules(rules)),
          fail,
        ),
        startMemoriesListener(
          uid,
          encryption,
          (memories) => dispatch(setMemories(memories)),
          fail,
        ),
        startDoneForYouListener(
          uid,
          encryption,
          (entries) => dispatch(setDoneForYou(entries)),
          fail,
        ),
        startAlertsListener(
          uid,
          encryption,
          (alerts) => dispatch(setAlerts(alerts)),
          fail,
        ),
        startAlertStatesListener(
          uid,
          (states) => dispatch(setAlertStates(states)),
          fail,
        ),
        startNeedsHomeListener(
          uid,
          encryption,
          (purchases) => dispatch(setNeedsHome(purchases)),
          fail,
        ),
      ];
    });

    return () => {
      run.isCurrent = false;
      stops.current.forEach((stop) => stop());
    };
  }, [uid, keyStatus, dispatch]);

  const isEmailGateOpen = useIsGateOpen('runway', EMAIL_PURCHASES_GATE_ID);
  const emailLevel = useAppSelector(selectLevel);
  const emailAttempt = useAppSelector(selectEmailIntakeAttempt);
  const isEmailOpen = isEmailGateOpen && emailLevel !== 'plan';

  useEffect(() => {
    if (!uid || keyStatus !== 'ready' || !isEmailOpen) return;

    const stops: { current: (() => void)[] } = { current: [] };
    const run = { isCurrent: true };

    getRunwayEncryption(uid)
      .then((encryption) => {
        if (!run.isCurrent) return;
        // Email is optional, so a failure here never closes the plan.
        const skip = (error: Error) =>
          console.error('Purchases from email did not open', error);
        stops.current = [
          startEmailIntakeListener(
            uid,
            encryption,
            (intake) => {
              dispatch(setEmailIntake(intake));
              dispatch(setIsEmailIntakeLoaded(true));
            },
            (error) => {
              skip(error);
              dispatch(setIsEmailIntakeFailed(true));
            },
          ),
          startEmailEventsListener(
            uid,
            encryption,
            (events) => dispatch(setEmailEvents(events)),
            skip,
          ),
          startEmailFiltersListener(
            uid,
            encryption,
            (filters) => dispatch(setEmailFilters(filters)),
            skip,
          ),
        ];
      })
      .catch((error: unknown) => {
        console.error('Purchases from email did not open', error);
        if (run.isCurrent) dispatch(setIsEmailIntakeFailed(true));
      });

    return () => {
      run.isCurrent = false;
      stops.current.forEach((stop) => stop());
      dispatch(setEmailIntake(null));
      dispatch(setIsEmailIntakeLoaded(false));
      dispatch(setIsEmailIntakeFailed(false));
      dispatch(setEmailEvents(null));
      dispatch(setEmailFilters([]));
    };
  }, [uid, keyStatus, isEmailOpen, emailAttempt, dispatch]);

  useEffect(() => {
    if (!uid || keyStatus !== 'ready') return;

    const stop: { current: (() => void) | null } = { current: null };
    const run = { isCurrent: true };
    const dirtyFrom = closingKey === 'none' ? null : closingKey;

    getRunwayEncryption(uid)
      .then((encryption) => {
        if (!run.isCurrent) return;
        stop.current = startClosingListener(
          uid,
          encryption,
          dirtyFrom,
          (closing) => dispatch(setClosing({ closing, key: closingKey })),
          () => dispatch(setKeyStatus('failed')),
        );
      })
      .catch(() => {
        if (run.isCurrent) dispatch(setKeyStatus('failed'));
      });

    return () => {
      run.isCurrent = false;
      stop.current?.();
    };
  }, [uid, keyStatus, closingKey, dispatch]);

  useEffect(() => {
    if (!uid || keyStatus !== 'ready' || recentFrom === null) return;

    const stops: { current: (() => void)[] } = { current: [] };
    const run = { isCurrent: true };

    getRunwayEncryption(uid)
      .then((encryption) => {
        if (!run.isCurrent) return;
        const fail = () => dispatch(setKeyStatus('failed'));
        stops.current = [
          startDaysListener(
            uid,
            encryption,
            recentFrom,
            (days) => dispatch(setDays({ from: recentFrom, days })),
            fail,
          ),
          startMovesListener(
            uid,
            encryption,
            recentFrom,
            (moves) => dispatch(setMoves({ from: recentFrom, moves })),
            fail,
          ),
          startPurchasesListener(
            uid,
            encryption,
            recentFrom,
            (purchases) =>
              dispatch(setPurchases({ from: recentFrom, purchases })),
            fail,
          ),
        ];
      })
      .catch(() => {
        if (run.isCurrent) dispatch(setKeyStatus('failed'));
      });

    return () => {
      run.isCurrent = false;
      stops.current.forEach((stop) => stop());
    };
  }, [uid, keyStatus, recentFrom, dispatch]);

  const level = useAppSelector(selectLevel);
  const linkHistoryRanges = useAppSelector(selectLinkHistoryRanges);

  useEffect(() => {
    if (!uid || keyStatus !== 'ready' || level !== 'link') return;
    if (linkHistoryRanges === '') return;

    const stops: (() => void)[] = [];
    const run = { isCurrent: true };
    const ranges = linkHistoryRanges
      .split(',')
      .map((range) => range.split(':').map(Number));
    const read = new Map<number, OpenPurchase[]>();
    // Only the check for purchases in twice reads this, so a failure skips that check instead of closing the plan.
    const skipHistoryRead = (error: unknown) => {
      if (!run.isCurrent) return;
      console.error('Purchases from before a link were not read', error);
      dispatch(setLinkHistoryPurchases([]));
    };

    getRunwayEncryption(uid)
      .then((encryption) => {
        if (!run.isCurrent) return;
        ranges.forEach(([from, to], index) => {
          stops.push(
            startPurchasesListener(
              uid,
              encryption,
              from,
              (purchases) => {
                read.set(index, purchases);
                if (read.size < ranges.length) return;
                dispatch(setLinkHistoryPurchases([...read.values()].flat()));
              },
              skipHistoryRead,
              to,
            ),
          );
        });
      })
      .catch(skipHistoryRead);

    return () => {
      run.isCurrent = false;
      stops.forEach((stop) => stop());
      dispatch(setLinkHistoryPurchases(null));
    };
  }, [uid, keyStatus, level, linkHistoryRanges, dispatch]);

  useEffect(() => {
    if (!uid || keyStatus !== 'ready' || confirmedDayIds === null) return;

    const stop: { current: (() => void) | null } = { current: null };
    const run = { isCurrent: true };
    const dayIds = confirmedDayIds === '' ? [] : confirmedDayIds.split(',');

    getRunwayEncryption(uid)
      .then((encryption) => {
        if (!run.isCurrent) return;
        stop.current = startRecordsListener(
          uid,
          encryption,
          dayIds,
          (records) =>
            dispatch(setRecords({ dayIds: confirmedDayIds, records })),
          () => dispatch(setKeyStatus('failed')),
        );
      })
      .catch(() => {
        if (run.isCurrent) dispatch(setKeyStatus('failed'));
      });

    return () => {
      run.isCurrent = false;
      stop.current?.();
    };
  }, [uid, keyStatus, confirmedDayIds, dispatch]);

  const {
    moreEntry,
    logSpan,
    logPage,
    logItem,
    activeTab,
    spendPeriod,
    daysMonth,
    openDayKey,
  } = useRunwayUrlState();
  const isSpendOpen = activeTab === 'spend';
  const {
    from: periodFrom,
    to: periodTo,
    key: periodKey,
  } = getSpendRange(spendPeriod, today);
  const isChangeLogOpen = moreEntry === 'changeLog';

  const windowMonth =
    (openDayKey === null ? null : getDayKeyMonth(openDayKey)) ?? daysMonth;
  const historyRange =
    windowMonth !== null &&
    recentFrom !== null &&
    getMonthStart(windowMonth) < recentFrom
      ? getHistoryRange(windowMonth, recentFrom)
      : null;
  const isHistoryOpen =
    historyRange !== null && (activeTab === 'days' || openDayKey !== null);
  const historyFrom = historyRange?.from ?? 0;
  const historyTo = historyRange?.to ?? 0;
  const historyKey = historyRange?.key ?? '';

  useEffect(() => {
    if (!uid || keyStatus !== 'ready' || !isHistoryOpen) return;

    const stop: { current: (() => void) | null } = { current: null };
    const run = { isCurrent: true };

    getRunwayEncryption(uid)
      .then((encryption) => {
        if (!run.isCurrent) return;
        stop.current = startDaysListener(
          uid,
          encryption,
          historyFrom,
          (days) => dispatch(setHistoryDays({ key: historyKey, days })),
          (error) => {
            console.error('The older days did not open', error);
            dispatch(setHistoryFailed(historyKey));
          },
          historyTo,
        );
      })
      .catch(() => {
        if (run.isCurrent) dispatch(setHistoryFailed(historyKey));
      });

    return () => {
      run.isCurrent = false;
      stop.current?.();
      dispatch(clearHistory());
    };
  }, [
    uid,
    keyStatus,
    isHistoryOpen,
    historyFrom,
    historyTo,
    historyKey,
    dispatch,
  ]);

  const historyDayIds = useAppSelector((state) =>
    isHistoryOpen && state.runway.historyFor === historyKey
      ? state.runway.historyDays
          .filter((day) => day.status === 'confirmed')
          .map((day) => day.id)
          .sort()
          .join(',')
      : null,
  );

  useEffect(() => {
    if (!uid || keyStatus !== 'ready' || historyDayIds === null) return;

    const stop: { current: (() => void) | null } = { current: null };
    const run = { isCurrent: true };
    const dayIds = historyDayIds === '' ? [] : historyDayIds.split(',');

    getRunwayEncryption(uid)
      .then((encryption) => {
        if (!run.isCurrent) return;
        stop.current = startRecordsListener(
          uid,
          encryption,
          dayIds,
          (records) =>
            dispatch(setHistoryRecords({ dayIds: historyDayIds, records })),
          (error) => {
            console.error('The older days did not open', error);
            dispatch(setHistoryFailed(historyKey));
          },
        );
      })
      .catch(() => {
        if (run.isCurrent) dispatch(setHistoryFailed(historyKey));
      });

    return () => {
      run.isCurrent = false;
      stop.current?.();
    };
  }, [uid, keyStatus, historyDayIds, historyKey, dispatch]);

  useEffect(() => {
    if (!uid || keyStatus !== 'ready' || !isSpendOpen) return;

    const stop: { current: (() => void) | null } = { current: null };
    const run = { isCurrent: true };

    getRunwayEncryption(uid)
      .then((encryption) => {
        if (!run.isCurrent) return;
        stop.current = startPurchasesListener(
          uid,
          encryption,
          periodFrom,
          (purchases) =>
            dispatch(setPeriodPurchases({ key: periodKey, purchases })),
          (error) => {
            console.error('The purchases did not open', error);
            dispatch(setPeriodFailed(periodKey));
          },
          periodTo,
        );
      })
      .catch(() => {
        if (run.isCurrent) dispatch(setPeriodFailed(periodKey));
      });

    return () => {
      run.isCurrent = false;
      stop.current?.();
      dispatch(clearPeriodPurchases());
    };
  }, [uid, keyStatus, isSpendOpen, periodFrom, periodTo, periodKey, dispatch]);

  useEffect(() => {
    if (!uid || keyStatus !== 'ready' || !isChangeLogOpen) return;

    const stop: { current: (() => void) | null } = { current: null };
    const run = { isCurrent: true };
    const window = getChangeWindow(today, Number(logSpan), logPage);
    const key = toChangeWindowKey(window, logItem);

    getRunwayEncryption(uid)
      .then((encryption) => {
        if (!run.isCurrent) return;
        stop.current = startChangesListener(
          uid,
          encryption,
          { ...window, itemId: logItem },
          (changes) => dispatch(setChanges({ key, changes })),
          (error) => {
            console.error('The change log did not open', error);
            dispatch(setChangesFailed(key));
          },
        );
      })
      .catch(() => {
        if (run.isCurrent) dispatch(setChangesFailed(key));
      });

    return () => {
      run.isCurrent = false;
      stop.current?.();
    };
  }, [
    uid,
    keyStatus,
    isChangeLogOpen,
    logSpan,
    logPage,
    logItem,
    today,
    dispatch,
  ]);

  useEffect(() => {
    if (!uid || keyStatus !== 'ready' || !isPlanLoaded || reachedEndings === '')
      return;
    const rows = JSON.parse(reachedEndings) as [string, number, string][];
    getRunwayEncryption(uid)
      .then(async (encryption) => {
        const written = await Promise.all(
          rows.map(async ([itemId, endedOn, name]) => {
            const isWritten = await endItem(uid, encryption, {
              itemId,
              endedOn,
              summary: `${name}: ended after its last payday, ${formatDateOrdinalUTC(endedOn)}.`,
              note: null,
              heldChoice: null,
            });
            return isWritten ? [{ itemId, name }] : [];
          }),
        );
        const looks = selectItemLooks(store.getState());
        recordDone(
          uid,
          written.flat().map(({ itemId, name }) => ({
            kind: 'ended' as const,
            title: DONE_FOR_YOU_WORDS.ended(name),
            detail: null,
            why: DONE_FOR_YOU_WORDS.endedWhy,
            undo: null,
            subject: toSubject({
              itemId,
              toName: name,
              toEmoji: looks.get(itemId)?.emoji ?? null,
            }),
          })),
        );
      })
      .catch((error) => console.error('Marking an ending did not save', error));
  }, [uid, keyStatus, isPlanLoaded, reachedEndings]);
}

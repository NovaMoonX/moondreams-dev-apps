import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';

import { SITE_VERSION } from '@/lib/app';
import { hasUnsavedWork } from '@/lib/app/unsavedWork';
import {
  getFirstEncounterMark,
  getHistoryNotes,
  getNewestVersion,
  getScopeName,
  getUnseenNotes,
  getVisibleNotes,
  getWhatsNewScope,
  shouldPopUp,
} from '@/lib/whatsNew/whatsNew';
import {
  closeWhatsNewHistory,
  useOpenWhatsNewHistory,
} from '@/lib/whatsNew/whatsNewHistoryStore';
import { whatsNewQueryOptions } from '@/lib/whatsNew/whatsNewQueries';
import type { WhatsNewNote, WhatsNewScope } from '@/lib/whatsNew/whatsNewTypes';
import { useAuth } from '@hooks/useAuth';
import {
  useWhatsNewSeen,
  writeShowFixOnly,
  writeWhatsNewSeen,
} from '@hooks/useWhatsNewSeen';
import { useCanSeeDebugDetails } from '@lib/debugProfiles/useCanSeeDebugDetails';
import { store, useAppSelector } from '@store/index';
import { selectIsGateOpen } from '@store/slices/featureGatesSlice';
import WhatsNewSheet from '@ui/WhatsNewSheet';

const SETTLE_MS = 1500;
const RETRY_MS = 2000;

/** Scopes whose pop-up already opened since this page loaded: a refresh brings it back, navigating inside the site doesn't. */
const poppedScopes = new Set<WhatsNewScope>();

const collapsedKey = (scope: WhatsNewScope) => `whatsNew.collapsed.${scope}`;

const readCollapsed = (scope: WhatsNewScope) => {
  try {
    return localStorage.getItem(collapsedKey(scope));
  } catch {
    return null;
  }
};

const writeCollapsed = (scope: WhatsNewScope, version: string | null) => {
  try {
    if (version === null) localStorage.removeItem(collapsedKey(scope));
    else localStorage.setItem(collapsedKey(scope), version);
  } catch {
    // Storage can be blocked; the pop-up then simply comes back next visit.
  }
};

/** A closed menu can stay in the page, faded out and hidden from assistive tech; only one the person can see counts. */
const isDialogShown = () =>
  Array.from(document.querySelectorAll('[role="dialog"]')).some(
    (dialog) =>
      !dialog.closest('[aria-hidden="true"]') &&
      getComputedStyle(dialog).opacity !== '0',
  );

const isGateOpen = (app: string, gate: string) =>
  selectIsGateOpen(store.getState(), app, gate);

/** The small tab a debug viewer's collapsed update log leaves at the screen's edge. */
function CollapsedTab({ onOpen }: { onOpen: () => void }) {
  return (
    <Button
      type='button'
      variant='base'
      aria-label="What's new"
      className='bg-primary text-primary-foreground fixed top-[55%] right-0 z-40 h-10 min-w-10 gap-1.5 rounded-l-full rounded-r-none px-3 shadow-md'
      onClick={onOpen}
    >
      <Sparkles className='size-4' aria-hidden='true' />
      <span className='text-sm font-medium max-[359px]:hidden'>
        What&apos;s new
      </span>
    </Button>
  );
}

/**
 * Owns what's new for the page the person is on: the pop-up that opens once something unseen is
 * worth saying, the collapsed tab a debug viewer keeps, and the history the account menu opens.
 */
function WhatsNewHost() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const scope = uid ? getWhatsNewScope(pathname) : null;
  const isDebug = useCanSeeDebugDetails();
  const feed = useQuery({ ...whatsNewQueryOptions(), enabled: scope !== null });
  const seen = useWhatsNewSeen(uid);
  const gates = useAppSelector((state) => state.featureGates);
  const historyScope = useOpenWhatsNewHistory();
  const [popupScope, setPopupScope] = useState<WhatsNewScope | null>(null);
  const [now] = useState(Date.now);
  const [, refresh] = useReducer((count: number) => count + 1, 0);
  const markedKeys = useRef(new Set<string>());

  const visible = useMemo(
    () =>
      scope && feed.data
        ? getVisibleNotes(feed.data, {
            scope,
            runningVersion: SITE_VERSION,
            isDebug,
            isGateOpen,
          })
        : [],
    // The gate settings are read through the store; their slice changing is what re-decides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, feed.data, isDebug, gates],
  );
  const mark = scope ? (seen.seen[scope] ?? null) : null;
  const unseen = useMemo(() => getUnseenNotes(visible, mark), [visible, mark]);
  const newest = getNewestVersion(unseen);
  const isPopUpWarranted = shouldPopUp(unseen, {
    isDebug,
    showFixOnly: seen.showFixOnly,
  });
  const isCollapsed =
    scope !== null && newest !== null && readCollapsed(scope) === newest;
  const isPopupOpen = scope !== null && popupScope === scope;
  const isHistoryOpen = scope !== null && historyScope === scope;
  const historyNotes = useMemo(
    () => getHistoryNotes(visible, now),
    [visible, now],
  );

  // First time in this scope (or right after this shipped): remember what is already here, show nothing.
  useEffect(() => {
    if (!uid || !scope || !seen.isLoaded || !feed.data || mark !== null) return;
    const firstMark = getFirstEncounterMark(visible, SITE_VERSION);
    const key = `${uid}:${scope}`;
    if (firstMark === null || markedKeys.current.has(key)) return;
    markedKeys.current.add(key);
    writeWhatsNewSeen(uid, scope, firstMark, seen.doesExist).catch((error) => {
      markedKeys.current.delete(key);
      console.error("Failed to save what's new mark:", error);
    });
  }, [uid, scope, seen.isLoaded, seen.doesExist, feed.data, mark, visible]);

  // Opens once the page has settled, never over typed work or another dialog; waits and tries again.
  useEffect(() => {
    if (!scope || !isPopUpWarranted || isCollapsed || poppedScopes.has(scope))
      return;
    const tryOpen = () => {
      if (hasUnsavedWork() || isDialogShown()) return false;
      poppedScopes.add(scope);
      setPopupScope(scope);
      return true;
    };
    let retry: ReturnType<typeof setInterval> | undefined;
    const settle = setTimeout(() => {
      if (!tryOpen()) {
        retry = setInterval(() => {
          if (tryOpen()) clearInterval(retry);
        }, RETRY_MS);
      }
    }, SETTLE_MS);
    return () => {
      clearTimeout(settle);
      clearInterval(retry);
    };
  }, [scope, isPopUpWarranted, isCollapsed, newest]);

  if (!uid || !scope) return null;

  const name = getScopeName(scope);
  const title =
    scope === 'site' ? `What's new on ${name}` : `What's new in ${name}`;

  const collapse = () => {
    writeCollapsed(scope, newest);
    setPopupScope(null);
    refresh();
  };
  const gotIt = () => {
    poppedScopes.add(scope);
    writeCollapsed(scope, null);
    setPopupScope(null);
    refresh();
    if (newest === null) return;
    writeWhatsNewSeen(uid, scope, newest, seen.doesExist).catch((error) =>
      console.error("Failed to save what's new mark:", error),
    );
  };
  const showMe = (note: WhatsNewNote, isHistory: boolean) => {
    if (note.path?.startsWith('/')) navigate(note.path);
    if (isHistory) closeWhatsNewHistory();
    else if (isDebug) collapse();
    else setPopupScope(null);
  };
  const stopFixOnly = () => {
    setPopupScope(null);
    writeShowFixOnly(uid, false, seen.doesExist).catch((error) =>
      console.error('Failed to save the fix-only setting:', error),
    );
  };

  return (
    <>
      {isPopUpWarranted ? (
        <WhatsNewSheet
          key={`${scope}:${newest}`}
          isOpen={isPopupOpen}
          title={title}
          mode='popup'
          notes={unseen}
          isDebug={isDebug}
          onClose={() => setPopupScope(null)}
          onGotIt={gotIt}
          onCollapse={collapse}
          onShowMe={(note) => showMe(note, false)}
          onStopFixOnly={stopFixOnly}
        />
      ) : null}
      {isHistoryOpen ? (
        <WhatsNewSheet
          key={`history:${scope}`}
          isOpen
          title={title}
          mode='history'
          notes={historyNotes}
          isDebug={isDebug}
          onClose={closeWhatsNewHistory}
          onShowMe={(note) => showMe(note, true)}
        />
      ) : null}
      {isDebug &&
      isPopUpWarranted &&
      isCollapsed &&
      !isPopupOpen &&
      !isHistoryOpen ? (
        <CollapsedTab
          onOpen={() => {
            poppedScopes.add(scope);
            setPopupScope(scope);
          }}
        />
      ) : null}
    </>
  );
}

export default WhatsNewHost;

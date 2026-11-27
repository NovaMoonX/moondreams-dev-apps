import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useQuery } from '@tanstack/react-query';
import { Megaphone } from 'lucide-react';

import SideTab from '@/components/SideTab';
import { useIsAppEntered } from '@/hooks/useAppEntered';
import { afterBackLayersClose } from '@/hooks/useBackHistory';
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
import { getWhatsNewLook } from '@/lib/whatsNew/whatsNewLooks';
import { whatsNewQueryOptions } from '@/lib/whatsNew/whatsNewQueries';
import type { WhatsNewNote, WhatsNewScope } from '@/lib/whatsNew/whatsNewTypes';
import { hasDialogOnTop } from '@/utils/dialogUtils';
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
const MAX_OPEN_TRIES = 15;

/** Scopes whose pop-up already opened since this page loaded: a refresh brings it back, navigating inside the site doesn't. */
const poppedScopes = new Set<string>();

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

const isGateOpen = (app: string, gate: string) =>
  selectIsGateOpen(store.getState(), app, gate);

/** The small tab a debug viewer's collapsed update log leaves at the screen's edge: an icon on a phone, with its words from `sm`. */
function CollapsedTab({ onOpen }: { onOpen: () => void }) {
  return (
    <SideTab
      side='right'
      label="What's new"
      icon={<Megaphone className='size-4' aria-hidden='true' />}
      className='bg-primary text-primary-foreground border-primary top-[55%] w-10 gap-1.5 sm:w-auto sm:min-w-10 sm:px-3'
      onClick={onOpen}
    >
      <span className='text-sm font-medium max-sm:hidden'>What&apos;s new</span>
    </SideTab>
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
  const [popup, setPopup] = useState<{
    scope: WhatsNewScope;
    notes: WhatsNewNote[];
    isOpen: boolean;
  } | null>(null);
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
  const isEntered = useIsAppEntered(scope);
  const isPopUpWarranted =
    isEntered &&
    shouldPopUp(unseen, {
      isDebug,
      showFixOnly: seen.showFixOnly,
    });
  const isCollapsed =
    isDebug &&
    scope !== null &&
    newest !== null &&
    readCollapsed(scope) === newest;
  const shownPopup = scope !== null && popup?.scope === scope ? popup : null;
  const isPopupOpen = shownPopup?.isOpen === true;
  const isHistoryOpen = scope !== null && historyScope === scope;
  const historyNotes = useMemo(
    () => getHistoryNotes(visible, now),
    [visible, now],
  );

  // First time in this scope (or right after this shipped): remember what is already here, show nothing.
  useEffect(() => {
    if (!uid || !scope || !seen.isLoaded || !feed.data || mark !== null) return;
    const firstMark = getFirstEncounterMark(feed.data, {
      scope,
      runningVersion: SITE_VERSION,
    });
    const key = `${uid}:${scope}`;
    if (firstMark === null || markedKeys.current.has(key)) return;
    markedKeys.current.add(key);
    writeWhatsNewSeen(uid, scope, firstMark).catch((error) => {
      markedKeys.current.delete(key);
      console.error("Failed to save what's new mark:", error);
    });
  }, [uid, scope, seen.isLoaded, feed.data, mark]);

  // Opens once the page has settled, never over typed work or another dialog; waits and tries again.
  useEffect(() => {
    if (!uid || !scope || !isPopUpWarranted || isCollapsed) return;
    const poppedKey = `${uid}:${scope}`;
    if (poppedScopes.has(poppedKey)) return;
    const tryOpen = () => {
      if (hasUnsavedWork() || hasDialogOnTop()) return false;
      poppedScopes.add(poppedKey);
      setPopup({ scope, notes: unseen, isOpen: true });
      return true;
    };
    let retry: ReturnType<typeof setInterval> | undefined;
    const settle = setTimeout(() => {
      if (!tryOpen()) {
        let tries = 0;
        retry = setInterval(() => {
          tries += 1;
          if (tryOpen() || tries >= MAX_OPEN_TRIES) clearInterval(retry);
        }, RETRY_MS);
      }
    }, SETTLE_MS);
    return () => {
      clearTimeout(settle);
      clearInterval(retry);
    };
  }, [uid, scope, isPopUpWarranted, isCollapsed, unseen]);

  if (!uid || !scope) return null;

  const name = getScopeName(scope);
  const title =
    scope === 'site' ? "What's new across the site" : `What's new in ${name}`;
  const poppedKey = `${uid}:${scope}`;
  const look = getWhatsNewLook(scope);

  const closePopup = () =>
    setPopup((held) => (held ? { ...held, isOpen: false } : held));
  const collapse = () => {
    writeCollapsed(scope, newest);
    closePopup();
    refresh();
  };
  const gotIt = () => {
    poppedScopes.add(poppedKey);
    writeCollapsed(scope, null);
    closePopup();
    refresh();
    const shownNewest = shownPopup && getNewestVersion(shownPopup.notes);
    if (!shownNewest) return;
    writeWhatsNewSeen(uid, scope, shownNewest).catch((error) =>
      console.error("Failed to save what's new mark:", error),
    );
  };
  const showMe = (note: WhatsNewNote, isHistory: boolean) => {
    if (isHistory) closeWhatsNewHistory();
    else if (isDebug) collapse();
    else closePopup();
    const path = note.path;
    if (path?.startsWith('/')) afterBackLayersClose(() => navigate(path));
  };
  const stopFixOnly = () => {
    closePopup();
    writeShowFixOnly(uid, false).catch((error) =>
      console.error('Failed to save the fix-only setting:', error),
    );
  };

  return (
    <>
      {shownPopup ? (
        <WhatsNewSheet
          key={`${scope}:${getNewestVersion(shownPopup.notes)}`}
          isOpen={shownPopup.isOpen}
          title={title}
          scopeName={name}
          mode='popup'
          notes={shownPopup.notes}
          look={look}
          isDebug={isDebug}
          onClose={closePopup}
          onGotIt={gotIt}
          onCollapse={collapse}
          onShowMe={(note) => showMe(note, false)}
          onStopFixOnly={stopFixOnly}
        />
      ) : null}
      <WhatsNewSheet
        key={`history:${scope}`}
        isOpen={isHistoryOpen}
        title={title}
        scopeName={name}
        mode='history'
        notes={historyNotes}
        look={look}
        feedState={
          feed.isPending ? 'loading' : feed.isError ? 'failed' : 'ready'
        }
        onRetry={() => void feed.refetch()}
        isDebug={isDebug}
        onClose={closeWhatsNewHistory}
        onShowMe={(note) => showMe(note, true)}
      />
      {isPopUpWarranted && isCollapsed && !isPopupOpen && !isHistoryOpen ? (
        <CollapsedTab
          onOpen={() => {
            poppedScopes.add(poppedKey);
            setPopup({ scope, notes: unseen, isOpen: true });
          }}
        />
      ) : null}
    </>
  );
}

export default WhatsNewHost;

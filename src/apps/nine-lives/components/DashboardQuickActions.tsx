import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ArrowUp, Cat, FileUp, Plus, Receipt, Shovel, Stethoscope, type LucideIcon } from 'lucide-react';
import { shallowEqual } from 'react-redux';

import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';

import { useAttentionFocus } from '../context/attentionFocusContext';
import { useVoiceQuickEntry } from '../hooks/useVoiceQuickEntry';
import {
  selectCatsByHousehold,
  selectIngestionDraftCountByHousehold,
  selectLitterBoxesByHousehold,
  selectLittersByHousehold,
} from '../store/selectors';
import CatQuickLog from './CatQuickLog';
import CountBadge from './CountBadge';
import DocumentIngestionModal from './DocumentIngestionModal';
import LitterQuickLog from './LitterQuickLog';
import VoiceQuickEntryModals from './VoiceQuickEntryModals';
import VoiceQuickEntryTrigger from './VoiceQuickEntryTrigger';

interface DashboardQuickActionsProps {
  householdId: string;
}

interface QuickEntry {
  key: string;
  label: string;
  icon: LucideIcon;
  disabledReason: string | null;
}

const FLOATING_SECONDARY_ACTIONS_CLASSNAME = 'h-10 w-10 shrink-0 gap-1 sm:h-12 sm:w-auto sm:px-4 rounded-full! bg-background'

function DashboardQuickActions({ householdId }: DashboardQuickActionsProps) {
  const { user } = useAuth();
  const { requestFocus } = useAttentionFocus();
  const [isOpen, setIsOpen] = useState(false);
  const [isLitterLogOpen, setIsLitterLogOpen] = useState(false);
  const [isCatLogOpen, setIsCatLogOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isFlatRowVisible, setIsFlatRowVisible] = useState(true);
  const flatRowRef = useRef<HTMLDivElement>(null);
  const floatingRef = useRef<HTMLDivElement>(null);
  const pendingDraftCount = useAppSelector(selectIngestionDraftCountByHousehold(householdId));
  const cats = useAppSelector(selectCatsByHousehold(householdId), shallowEqual);
  const litterBoxes = useAppSelector(selectLitterBoxesByHousehold(householdId), shallowEqual);
  const litters = useAppSelector(selectLittersByHousehold(householdId), shallowEqual);
  const voiceQuickEntry = useVoiceQuickEntry(householdId, user?.uid ?? '');

  useEffect(() => {
    const node = flatRowRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      setIsFlatRowVisible(entry.isIntersecting);
      if (entry.isIntersecting) {
        setIsMoreOpen(false);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isMoreOpen) {
      return;
    }

    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!floatingRef.current?.contains(event.target as Node)) {
        setIsMoreOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMoreOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isMoreOpen]);

  const handleQuickEntry = useCallback((key: string) => {
    if (key === 'visit') {
      requestFocus({ kind: 'visit-new', requestedAt: Date.now() });
    } else if (key === 'expense') {
      requestFocus({ kind: 'expense-new', requestedAt: Date.now() });
    } else if (key === 'litter') {
      setIsLitterLogOpen(true);
    } else {
      setIsCatLogOpen(true);
    }
  }, [requestFocus]);

  if (!user?.uid) {
    return null;
  }

  const noCatsReason = cats.length === 0 ? 'Add a cat first' : null;
  const litterReason =
    litterBoxes.some((box) => box.isActive) && litters.length > 0
      ? null
      : 'Add a litter box and a litter product first';

  const quickEntries: QuickEntry[] = [
    {
      key: 'visit',
      label: 'Visit',
      icon: Stethoscope,
      disabledReason: noCatsReason,
    },
    {
      key: 'expense',
      label: 'Expense',
      icon: Receipt,
      disabledReason: noCatsReason,
    },
    {
      key: 'litter',
      label: 'Litter',
      icon: Shovel,
      disabledReason: litterReason,
    },
    {
      key: 'cat',
      label: 'Cat',
      icon: Cat,
      disabledReason: noCatsReason,
    },
  ];

  return (
    <>
      <div ref={flatRowRef} className='space-y-3'>
        <div className='flex flex-wrap items-center justify-center gap-2'>
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='gap-1'
            onClick={() => setIsOpen(true)}
          >
            <FileUp className='h-4 w-4' /> Upload document
            {pendingDraftCount > 0 && <CountBadge count={pendingDraftCount} />}
          </Button>
          <VoiceQuickEntryTrigger
            variant='flat'
            isListening={voiceQuickEntry.isListening}
            isExtracting={voiceQuickEntry.isExtracting}
            isSupported={voiceQuickEntry.isSupported}
            onClick={voiceQuickEntry.handleTrigger}
          />
        </div>
        <div className='mx-auto grid max-w-sm grid-cols-4 gap-2'>
          {quickEntries.map(({ key, label, icon: Icon, disabledReason }) => (
            <Button
              key={key}
              type='button'
              variant='outline'
              aria-label={`Log ${label.toLowerCase()}`}
              title={disabledReason ?? `Log ${label.toLowerCase()}`}
              disabled={disabledReason !== null}
              className='h-auto flex-col gap-1 py-2'
              onClick={() => handleQuickEntry(key)}
            >
              <Icon className='h-5 w-5' />
              <span className='text-xs font-normal'>{label}</span>
            </Button>
          ))}
        </div>
      </div>

      {!isFlatRowVisible && (
        <div ref={floatingRef} className='fixed right-4 bottom-4 z-40 flex flex-col items-end gap-2'>
          {isMoreOpen && (
            <div className='bg-card border-border flex flex-col gap-1 rounded-2xl border p-2 shadow-lg'>
              {quickEntries.map(({ key, label, icon: Icon, disabledReason }) => (
                <Button
                  key={key}
                  type='button'
                  variant='tertiary'
                  title={disabledReason ?? `Log ${label.toLowerCase()}`}
                  disabled={disabledReason !== null}
                  className='justify-start gap-2'
                  onClick={() => {
                    setIsMoreOpen(false);
                    handleQuickEntry(key);
                  }}
                >
                  <Icon className='h-4 w-4' /> {label}
                </Button>
              ))}
            </div>
          )}
          <Button
            type='button'
            variant='outline'
            size='icon'
            aria-label={isMoreOpen ? 'Close quick entries' : 'More quick entries'}
            aria-expanded={isMoreOpen}
            title={isMoreOpen ? 'Close quick entries' : 'More quick entries'}
            className='border-primary text-primary bg-background h-10 w-10 shrink-0 rounded-full! sm:h-12 sm:w-12'
            onClick={() => setIsMoreOpen((current) => !current)}
          >
            <Plus className={join('h-5 w-5 transition-transform', isMoreOpen && 'rotate-45')} />
          </Button>
          <VoiceQuickEntryTrigger
            variant='floating'
            isListening={voiceQuickEntry.isListening}
            isExtracting={voiceQuickEntry.isExtracting}
            isSupported={voiceQuickEntry.isSupported}
            onClick={voiceQuickEntry.handleTrigger}
            buttonClassName={FLOATING_SECONDARY_ACTIONS_CLASSNAME}
          />
          <Button
            type='button'
            variant='outline'
            size='icon'
            aria-label='Upload document'
            title='Upload document'
            className={FLOATING_SECONDARY_ACTIONS_CLASSNAME}
            onClick={() => setIsOpen(true)}
          >
            <FileUp className='h-4 w-4' />
            <span className='hidden sm:inline'>Upload</span>
          </Button>
          <Button
            type='button'
            variant='primary'
            size='icon'
            aria-label='Scroll to top'
            title='Scroll to top'
            className='h-12 w-12 shrink-0 gap-1 sm:h-12 sm:w-auto sm:px-3 rounded-full!'
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <ArrowUp className='h-5 w-5' />
            <span className='hidden sm:inline'>Top</span>
          </Button>
        </div>
      )}

      <VoiceQuickEntryModals householdId={householdId} uid={user.uid} {...voiceQuickEntry} />
      <DocumentIngestionModal
        isOpen={isOpen}
        householdId={householdId}
        uid={user.uid}
        onClose={() => setIsOpen(false)}
      />
      <LitterQuickLog householdId={householdId} isOpen={isLitterLogOpen} onClose={() => setIsLitterLogOpen(false)} />
      <CatQuickLog
        householdId={householdId}
        cats={cats}
        isMenuOpen={isCatLogOpen}
        onMenuClose={() => setIsCatLogOpen(false)}
      />
    </>
  );
}

export default DashboardQuickActions;

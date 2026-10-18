import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { Button, Drawer, Popover } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight } from 'lucide-react';

import { useMediaQuery } from '@/hooks/useMediaQuery';

const PHONE_FOCUS_DELAY_MS = 350;
const DESKTOP_FOCUS_DELAY_MS = 30;
const SHORT_SCREEN_QUERY = '(max-height: 599px)';

const subscribeToHeight = (onChange: () => void) => {
  const query = window.matchMedia(SHORT_SCREEN_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};

const getIsShortScreen = () => window.matchMedia(SHORT_SCREEN_QUERY).matches;

interface EditorBodyProps {
  focusDelay: number | null;
  onDone: () => void;
  children: ReactNode;
}

function EditorBody({ focusDelay, onDone, children }: EditorBodyProps) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusDelay === null) {
      return;
    }
    const timer = window.setTimeout(() => {
      const field = bodyRef.current?.querySelector<
        HTMLInputElement | HTMLTextAreaElement
      >('input, textarea');
      field?.focus();
      if (field && field.selectionStart !== null) {
        field.setSelectionRange(field.value.length, field.value.length);
      }
    }, focusDelay);
    return () => window.clearTimeout(timer);
  }, [focusDelay]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      onDone();
    }
  };

  return (
    <div ref={bodyRef} className='space-y-3' onKeyDown={handleKeyDown}>
      {children}
    </div>
  );
}

interface SummaryEditorProps {
  /** A small caption above the summary. */
  label: string;
  /** What the field holds; empty shows `placeholder` instead. */
  summary: string;
  placeholder: string;
  /** Why what is stored can't be used, shown under the summary so a closed editor never hides it. */
  problem?: string | null;
  /** The drawer's title and the popover's heading. */
  title: string;
  /** How many lines of the summary show before it is cut off. */
  lines?: 1 | 2;
  /** Opens by itself once, for the one question a blank record starts with. */
  defaultOpen?: boolean;
  /** A roomy row in a hairline card, for a screen whose first row is what it acts on; the row's icon chip goes with it. */
  isFramed?: boolean;
  /** An emoji or icon in a round chip before the text; only shown on a framed row. */
  icon?: ReactNode;
  /** Whether the editor's first field takes focus when it opens; off for an editor that starts with options to pick, where a keyboard would cover them. */
  isFocusedOnOpen?: boolean;
  /** The editor: its first field is focused when it opens, and Enter in a one-line field closes it. */
  children: ReactNode;
}

/** A form field shown as one summary line that opens its editor: a drawer over the form on a phone or a short screen, a popover under the line from `sm` up, each ending in Done. */
function SummaryEditor({
  label,
  summary,
  placeholder,
  problem = null,
  title,
  lines = 1,
  defaultOpen = false,
  isFramed = false,
  icon,
  isFocusedOnOpen = true,
  children,
}: SummaryEditorProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const isNarrow = useMediaQuery().isBelow('sm');
  const isShort = useSyncExternalStore(
    subscribeToHeight,
    getIsShortScreen,
    () => false,
  );
  const isDrawer = isNarrow || isShort;
  const close = () => setIsOpen(false);
  const isEmpty = summary === '';

  const trigger = (
    <Button
      type='button'
      variant='tertiary'
      aria-haspopup='dialog'
      aria-expanded={isOpen}
      onClick={() => setIsOpen((open) => !open)}
      className={join(
        'h-auto w-full items-start justify-start gap-3 text-left',
        isFramed
          ? 'border-border hover:bg-muted text-foreground! min-h-16 rounded-2xl border px-3! py-2'
          : 'min-h-11 px-0! py-2',
      )}
    >
      {isFramed && icon !== undefined && (
        <span
          className='bg-accent text-accent-foreground mt-0.5 grid size-10 shrink-0 place-items-center rounded-full text-lg leading-none [&_svg]:size-5'
          aria-hidden='true'
        >
          {icon}
        </span>
      )}
      <span
        className={join(
          'min-w-0 flex-1',
          isFramed && 'flex min-h-11 flex-col justify-center',
        )}
      >
        <span className='text-muted-foreground block text-xs font-normal'>
          {label}
        </span>
        <span
          className={join(
            'text-base font-normal break-words',
            lines === 1 ? 'block truncate' : 'line-clamp-2',
            isEmpty && 'text-muted-foreground',
          )}
        >
          {isEmpty ? placeholder : summary}
        </span>
        {problem && (
          <span className='text-destructive block text-xs font-normal'>
            {problem}
          </span>
        )}
      </span>
      <ChevronRight
        className={join(
          'text-muted-foreground shrink-0',
          isFramed ? 'mt-3 -ml-1 size-5' : 'mt-2.5 h-5 w-5',
        )}
        aria-hidden='true'
      />
    </Button>
  );

  const doneButton = (
    <Button type='button' className='w-full' onClick={close}>
      Done
    </Button>
  );

  if (isDrawer) {
    return (
      <>
        {trigger}
        {isOpen && (
          <Drawer
            isOpen
            onClose={close}
            title={title}
            showCloseButton
            footer={<div className='px-4 pb-4'>{doneButton}</div>}
          >
            <div className='pb-4'>
              <EditorBody
                focusDelay={isFocusedOnOpen ? PHONE_FOCUS_DELAY_MS : null}
                onDone={close}
              >
                {children}
              </EditorBody>
            </div>
          </Drawer>
        )}
      </>
    );
  }

  return (
    <div className='[&>div]:block [&>div]:w-full'>
      <Popover
        trigger={trigger}
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        placement='bottom'
        alignment='start'
        className='w-[min(26rem,calc(100vw-2rem))] p-4'
      >
        {isOpen && (
          <div className='space-y-3'>
            <h3 className='text-sm font-semibold'>{title}</h3>
            <EditorBody
              focusDelay={isFocusedOnOpen ? DESKTOP_FOCUS_DELAY_MS : null}
              onDone={close}
            >
              {children}
            </EditorBody>
            {doneButton}
          </div>
        )}
      </Popover>
    </div>
  );
}

export default SummaryEditor;

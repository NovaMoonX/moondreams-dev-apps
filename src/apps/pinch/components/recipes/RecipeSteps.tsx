import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import {
  Button,
  Input,
  Popover,
  Textarea,
} from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Pencil, Plus, Trash2, Ungroup, X } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import DetailSheet from '@/components/DetailSheet';
import Field from '@/components/forms/Field';
import PickOrCreate, { NEW_CHOICE } from '@/components/forms/PickOrCreate';
import RevealChip from '@/components/RevealChip';
import SectionDivider from '@/components/SectionDivider';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import {
  MAX_RECIPE_STEPS,
  MAX_STEP_LENGTH,
  MAX_STEP_SECTION_LENGTH,
} from '@apps/pinch/constants';
import {
  cleanStepSection,
  getStepSectionKey,
  groupStepSections,
} from '@apps/pinch/utils/stepSections';
import { canFocusFieldOnOpen } from '@/utils/focusUtils';

const PHONE_FOCUS_DELAY_MS = 350;
const DESKTOP_FOCUS_DELAY_MS = 30;

/** A rename changes the heading's key, so focus finds it by the new name. */
const focusSectionHeading = (name: string) =>
  window.requestAnimationFrame(() =>
    document
      .querySelector<HTMLElement>(
        `[data-section-heading="${CSS.escape(getStepSectionKey(name))}"]`,
      )
      ?.focus({ preventScroll: true }),
  );

const getSectionNames = (sections: (string | null)[]) =>
  sections.reduce<string[]>((names, name) => {
    const cleaned = cleanStepSection(name);
    return cleaned === null ||
      names.some(
        (other) => getStepSectionKey(other) === getStepSectionKey(cleaned),
      )
      ? names
      : [...names, cleaned];
  }, []);

interface SectionFieldProps {
  section: string | null;
  /** The recipe's section names when the editor opened, so a name being typed never becomes a pill under the field. */
  names: string[];
  onChange: (section: string | null) => void;
}

function SectionField({
  section,
  names: namesNow,
  onChange,
}: SectionFieldProps) {
  const [names] = useState(namesNow);
  const [choice, setChoice] = useState(section ?? '');
  const [newText, setNewText] = useState('');
  const [isShown, setIsShown] = useState(section !== null || names.length > 0);
  const wrapRef = useRef<HTMLDivElement>(null);

  if (!isShown) {
    return (
      <RevealChip
        icon={<Plus className='h-4 w-4' aria-hidden='true' />}
        onClick={() => {
          setIsShown(true);
          window.requestAnimationFrame(() =>
            wrapRef.current?.querySelector('input')?.focus(),
          );
        }}
      >
        Put it in a section
      </RevealChip>
    );
  }

  return (
    <div ref={wrapRef} className='space-y-1.5'>
      <p className='font-medium'>Section</p>
      <PickOrCreate
        label='Section'
        options={names.map((name) => ({ value: name, label: name }))}
        choice={choice}
        newText={newText}
        newPillLabel='New section'
        newPlaceholder='Cook the chicken'
        maxLength={MAX_STEP_SECTION_LENGTH}
        clearLabel='No section'
        onChange={(nextChoice, nextText) => {
          setChoice(nextChoice);
          setNewText(nextText);
          onChange(
            cleanStepSection(nextChoice === NEW_CHOICE ? nextText : nextChoice),
          );
        }}
      />
      <p className='text-muted-foreground text-xs'>
        Steps with the same section next to each other show together under its
        name.
      </p>
    </div>
  );
}

interface SectionHeadingProps {
  name: string;
  stepCount: number;
  onRename: (name: string) => void;
  onRemove: () => void;
}

/** Closing the editor keeps the typed name. */
function SectionHeading({
  name,
  stepCount,
  onRename,
  onRemove,
}: SectionHeadingProps) {
  const isPhone = useMediaQuery().isBelow('sm');
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(name);
  const bodyRef = useRef<HTMLDivElement>(null);
  const focusDelay = isPhone ? PHONE_FOCUS_DELAY_MS : DESKTOP_FOCUS_DELAY_MS;

  useEffect(() => {
    if (!isOpen || !canFocusFieldOnOpen()) return;
    const timer = window.setTimeout(
      () => bodyRef.current?.querySelector('input')?.focus(),
      focusDelay,
    );
    return () => window.clearTimeout(timer);
  }, [isOpen, focusDelay]);

  const close = () => {
    setIsOpen(false);
    const cleaned = cleanStepSection(draft);
    if (cleaned !== null && cleaned !== name) {
      onRename(cleaned);
      return;
    }
    focusSectionHeading(name);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      close();
    }
  };
  const body = (
    <div ref={bodyRef} className='space-y-3' onKeyDown={handleKeyDown}>
      <Field label='Name'>
        {(id) => (
          <Input
            id={id}
            variant='outline'
            value={draft}
            maxLength={MAX_STEP_SECTION_LENGTH}
            onChange={(event) => setDraft(event.target.value)}
          />
        )}
      </Field>
      <ActionRow
        isDestructive
        icon={<Ungroup className='h-4 w-4' />}
        label='Remove the section'
        subtitle={
          stepCount === 1
            ? 'Its step stays, with no section.'
            : `Its ${stepCount} steps stay, with no section.`
        }
        onClick={() => {
          setIsOpen(false);
          onRemove();
        }}
      />
    </div>
  );
  const trigger = (
    <Button
      type='button'
      variant='tertiary'
      size='sm'
      aria-haspopup='dialog'
      aria-expanded={isOpen}
      aria-label={`${name}: rename or remove the section`}
      data-section-heading={getStepSectionKey(name)}
      className='text-muted-foreground! h-10 max-w-full gap-1.5 px-2 text-sm font-medium'
      onClick={() => {
        if (isOpen) {
          close();
          return;
        }
        setDraft(name);
        setIsOpen(true);
      }}
    >
      <span className='min-w-0 wrap-break-word whitespace-normal'>{name}</span>
      <Pencil className='h-3.5 w-3.5 shrink-0' aria-hidden='true' />
    </Button>
  );

  if (isPhone) {
    return (
      <>
        <SectionDivider label={trigger} className='pt-2' />
        {isOpen && (
          <DetailSheet
            isOpen
            onClose={close}
            title='Section'
            footer={
              <div className='px-4 pb-4'>
                <Button type='button' className='w-full' onClick={close}>
                  Done
                </Button>
              </div>
            }
          >
            {body}
          </DetailSheet>
        )}
      </>
    );
  }

  return (
    <SectionDivider
      className='pt-2'
      label={
        <Popover
          trigger={trigger}
          isOpen={isOpen}
          onOpenChange={(next) => (next ? setIsOpen(true) : close())}
          placement='bottom'
          alignment='center'
          className='w-[min(22rem,calc(100vw-2rem))] p-4'
        >
          {isOpen && (
            <div className='space-y-3'>
              <h3 className='text-sm font-semibold'>Section</h3>
              {body}
              <Button type='button' className='w-full' onClick={close}>
                Done
              </Button>
            </div>
          )}
        </Popover>
      }
    />
  );
}

interface StepDrawerMode {
  index: number;
  isNew: boolean;
}

interface StepDrawerProps {
  steps: string[];
  sections: (string | null)[];
  mode: StepDrawerMode;
  onChange: (steps: string[], sections: (string | null)[]) => void;
  onRemove: (index: number) => void;
  onClose: () => void;
}

/** Writes one step without leaving the recipe; a step left blank is dropped when the drawer closes. */
function StepDrawer({
  steps,
  sections,
  mode,
  onChange,
  onRemove,
  onClose,
}: StepDrawerProps) {
  const [index, setIndex] = useState(mode.index);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const step = steps[index] ?? '';
  const isBlank = step.trim() === '';

  // The drawer takes focus itself while it slides in, so the text box is focused once that settles.
  useEffect(() => {
    if (!canFocusFieldOnOpen()) return;
    const timer = window.setTimeout(() => textRef.current?.focus(), 350);
    return () => window.clearTimeout(timer);
  }, [index]);

  const removeStep = () =>
    onChange(
      steps.filter((_, at) => at !== index),
      sections.filter((_, at) => at !== index),
    );
  const close = () => {
    if (isBlank) removeStep();
    onClose();
  };

  return (
    <DetailSheet
      isOpen
      onClose={close}
      title={`Step ${index + 1}`}
      footer={
        <div className='space-y-2 px-4 pb-4'>
          <Button type='button' className='w-full' onClick={close}>
            Done
          </Button>
          {mode.isNew && steps.length < MAX_RECIPE_STEPS && (
            <Button
              type='button'
              variant='secondary'
              className='w-full'
              disabled={isBlank}
              onClick={() => {
                onChange(
                  [...steps, ''],
                  [...sections, sections[index] ?? null],
                );
                setIndex(steps.length);
              }}
            >
              Add another
            </Button>
          )}
        </div>
      }
    >
      <div className='space-y-3'>
        <Textarea
          key={index}
          ref={textRef}
          rows={6}
          variant='outline'
          aria-label={`Step ${index + 1} text`}
          placeholder='Write this step'
          maxLength={MAX_STEP_LENGTH}
          value={step}
          onChange={(event) =>
            onChange(
              steps.map((current, at) =>
                at === index ? event.target.value : current,
              ),
              sections,
            )
          }
        />
        <SectionField
          key={index}
          section={sections[index] ?? null}
          names={getSectionNames(sections)}
          onChange={(section) =>
            onChange(
              steps,
              sections.map((current, at) => (at === index ? section : current)),
            )
          }
        />
        {!mode.isNew && (
          <ActionRow
            isDestructive
            icon={<Trash2 className='h-4 w-4' />}
            label='Remove step'
            onClick={() => {
              onRemove(index);
              onClose();
            }}
          />
        )}
      </div>
    </DetailSheet>
  );
}

interface RecipeStepsProps {
  steps: string[];
  /** Each step's section, index for index with `steps`. */
  sections: (string | null)[];
  onChange: (steps: string[], sections: (string | null)[]) => void;
  /** Called with what a removal says and how to take it back. */
  onRemoved: (message: string, restore: () => void) => void;
  /** Drawn under "Add a step". */
  footerAction?: ReactNode;
}

/** The method as a column of one-line summaries, under a heading for each section. On a phone writing a step happens in a drawer; from `sm` up the step being written is the one row open in place. */
function RecipeSteps({
  steps,
  sections: storedSections,
  onChange,
  onRemoved,
  footerAction,
}: RecipeStepsProps) {
  const isPhone = useMediaQuery().isBelow('sm');
  const [openStep, setOpenStep] = useState<number | null>(null);
  const [drawer, setDrawer] = useState<StepDrawerMode | null>(null);
  const sections = steps.map((_, at) => storedSections[at] ?? null);
  const latest = useRef({ steps, sections, onChange });
  useEffect(() => {
    latest.current = { steps, sections, onChange };
  });

  const remove = (index: number) => {
    const removed = steps[index];
    const removedSection = sections[index];
    onChange(
      steps.filter((_, at) => at !== index),
      sections.filter((_, at) => at !== index),
    );
    onRemoved(`Removed step ${index + 1}`, () =>
      latest.current.onChange(
        [
          ...latest.current.steps.slice(0, index),
          removed,
          ...latest.current.steps.slice(index),
        ],
        [
          ...latest.current.sections.slice(0, index),
          removedSection,
          ...latest.current.sections.slice(index),
        ],
      ),
    );
  };

  const setBlockSection = (indexes: number[], name: string | null) =>
    sections.map((current, at) => (indexes.includes(at) ? name : current));

  const removeSection = (name: string, indexes: number[]) => {
    onChange(steps, setBlockSection(indexes, null));
    onRemoved(`Removed the section “${name}”`, () =>
      latest.current.onChange(
        latest.current.steps,
        latest.current.sections.map((current, at) =>
          indexes.includes(at) ? name : current,
        ),
      ),
    );
  };

  const blocks = groupStepSections(steps, sections);

  return (
    <div className='space-y-2'>
      {blocks.flatMap((block) => [
        ...(block.name === null
          ? []
          : [
              <SectionHeading
                key={`heading-${block.steps[0].index}`}
                name={block.name}
                stepCount={block.steps.length}
                onRename={(name) => {
                  const indexes = block.steps.map(({ index }) => index);
                  onChange(steps, setBlockSection(indexes, name));
                  focusSectionHeading(name);
                }}
                onRemove={() =>
                  removeSection(
                    block.name ?? '',
                    block.steps.map(({ index }) => index),
                  )
                }
              />,
            ]),
        ...block.steps.map(({ text: step, index }) => (
          <div key={`step-${index}`} className='space-y-2'>
            <div className='flex items-start gap-1'>
              <Button
                type='button'
                variant='tertiary'
                aria-expanded={isPhone ? undefined : openStep === index}
                aria-label={`Step ${index + 1}`}
                onClick={() => {
                  if (isPhone) {
                    setDrawer({ index, isNew: false });
                    return;
                  }
                  setOpenStep((current) => (current === index ? null : index));
                }}
                className='h-auto min-w-0 flex-1 items-start justify-start gap-3 px-0! py-2 text-left'
              >
                <span className='bg-accent text-accent-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold'>
                  {index + 1}
                </span>
                <span
                  className={join(
                    'line-clamp-2 min-w-0 flex-1 text-sm font-normal',
                    step.trim() === '' && 'text-muted-foreground',
                  )}
                >
                  {step.trim() === '' ? 'Write this step' : step}
                </span>
              </Button>
              <Button
                type='button'
                variant='tertiary'
                size='icon'
                aria-label={`Remove step ${index + 1}`}
                className='size-10 shrink-0'
                onClick={() => {
                  setOpenStep(null);
                  remove(index);
                }}
              >
                <X className='h-4 w-4' aria-hidden='true' />
              </Button>
            </div>
            {!isPhone && openStep === index && (
              <div className='space-y-3'>
                <Textarea
                  rows={3}
                  variant='outline'
                  autoFocus
                  aria-label={`Step ${index + 1} text`}
                  maxLength={MAX_STEP_LENGTH}
                  value={step}
                  onChange={(event) =>
                    onChange(
                      steps.map((current, at) =>
                        at === index ? event.target.value : current,
                      ),
                      sections,
                    )
                  }
                />
                <SectionField
                  section={sections[index]}
                  names={getSectionNames(sections)}
                  onChange={(section) =>
                    onChange(steps, setBlockSection([index], section))
                  }
                />
              </div>
            )}
          </div>
        )),
      ])}
      {steps.length < MAX_RECIPE_STEPS && (
        <Button
          type='button'
          variant='secondary'
          rounded='full'
          className='gap-1.5'
          onClick={() => {
            onChange([...steps, ''], [...sections, sections.at(-1) ?? null]);
            if (isPhone) {
              setDrawer({ index: steps.length, isNew: true });
              return;
            }
            setOpenStep(steps.length);
          }}
        >
          <Plus className='h-4 w-4' aria-hidden='true' />
          Add a step
        </Button>
      )}
      {footerAction}
      {isPhone && drawer && (
        <StepDrawer
          steps={steps}
          sections={sections}
          mode={drawer}
          onChange={onChange}
          onRemove={remove}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  );
}

export default RecipeSteps;

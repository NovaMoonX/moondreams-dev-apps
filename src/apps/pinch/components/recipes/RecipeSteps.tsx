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
import MoveChoices from '@/components/MoveChoices';
import ReorderList, { type ReorderGroup } from '@/components/ReorderList';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { generateUuid } from '@/utils';
import { clipAtWord } from '@/utils/stringUtils';
import {
  MAX_RECIPE_STEPS,
  MAX_STEP_LENGTH,
  MAX_STEP_SECTION_LENGTH,
} from '@apps/pinch/constants';
import {
  canMoveStepSection,
  getStepNeighbourSlot,
  moveStep,
  moveStepSection,
  type MoveDirection,
  type ReorderSlot,
} from '@apps/pinch/utils/recipeReorder';
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
  /** Left out where the section cannot move that way. */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  upSubtitle?: string;
  downSubtitle?: string;
}

function SectionHeading({
  name,
  stepCount,
  onRename,
  onRemove,
  onMoveUp,
  onMoveDown,
  upSubtitle,
  downSubtitle,
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
      <MoveChoices
        itemNoun='section'
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        upSubtitle={upSubtitle}
        downSubtitle={downSubtitle}
      />
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
        {trigger}
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
  );
}

interface StepMove {
  slot: ReorderSlot;
  subtitle: string;
}

interface StepItem {
  id: string;
  index: number;
  text: string;
}

const MAX_STEP_LABEL_LENGTH = 40;

const countWords = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;

/** What a one-place move does to a step: the neighbour it passes, or the section it crosses into. */
const describeStepMove = (
  list: { steps: string[]; sections: (string | null)[] },
  index: number,
  direction: MoveDirection,
): StepMove | null => {
  const slot = getStepNeighbourSlot(list, index, direction);
  if (!slot) return null;
  const blocks = groupStepSections(list.steps, list.sections);
  const from = blocks.findIndex((block) =>
    block.steps.some((step) => step.index === index),
  );
  if (slot.group !== from) {
    const name = blocks[slot.group]?.name ?? null;
    return {
      slot,
      subtitle: name === null ? 'Out of its section' : `Into “${name}”`,
    };
  }
  const place = blocks[from].steps.findIndex((step) => step.index === index);
  const neighbour = blocks[from].steps[place + direction];
  return {
    slot,
    subtitle: `${direction === -1 ? 'Before' : 'After'} step ${neighbour.index + 1}`,
  };
};

interface StepMoveChoicesProps {
  index: number;
  describeMove: (index: number, direction: MoveDirection) => StepMove | null;
  onMove: (direction: MoveDirection) => void;
}

function StepMoveChoices({
  index,
  describeMove,
  onMove,
}: StepMoveChoicesProps) {
  const up = describeMove(index, -1);
  const down = describeMove(index, 1);
  return (
    <MoveChoices
      itemNoun='step'
      onMoveUp={up ? () => onMove(-1) : undefined}
      onMoveDown={down ? () => onMove(1) : undefined}
      upSubtitle={up?.subtitle}
      downSubtitle={down?.subtitle}
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
  /** Where a step would land one place up or down, or null at either end. */
  describeMove: (index: number, direction: MoveDirection) => StepMove | null;
  /** Moves the step one place and returns its new index. */
  onMove: (index: number, direction: MoveDirection) => number;
  onClose: () => void;
}

/** Writes one step without leaving the recipe; a step left blank is dropped when the drawer closes. */
function StepDrawer({
  steps,
  sections,
  mode,
  onChange,
  onRemove,
  describeMove,
  onMove,
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
          key={`section-${index}`}
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
          <StepMoveChoices
            index={index}
            describeMove={describeMove}
            onMove={(direction) => setIndex(onMove(index, direction))}
          />
        )}
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

const ADDED_ID = 'added-';

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
  const [keptIds, setKeptIds] = useState(() => steps.map(() => generateUuid()));
  const ids =
    keptIds.length === steps.length
      ? keptIds
      : steps.map((_, at) => keptIds[at] ?? `${ADDED_ID}${at}`);
  const toKeptId = (id: string) =>
    id.startsWith(ADDED_ID) ? generateUuid() : id;
  const keepIds = (next: string[]) => setKeptIds(next.map(toKeptId));
  const latest = useRef({ steps, sections, onChange });
  useEffect(() => {
    latest.current = { steps, sections, onChange };
  });

  const remove = (index: number) => {
    const removed = steps[index];
    const removedSection = sections[index];
    const removedId = toKeptId(ids[index]);
    keepIds(ids.filter((_, at) => at !== index));
    onChange(
      steps.filter((_, at) => at !== index),
      sections.filter((_, at) => at !== index),
    );
    onRemoved(`Removed step ${index + 1}`, () => {
      setKeptIds((current) => [
        ...current.slice(0, index),
        removedId,
        ...current.slice(index),
      ]);
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
      );
    });
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
  const blockIds = blocks.map(
    (block, at) =>
      `${getStepSectionKey(block.name)}#${blocks.slice(0, at).filter((other) => getStepSectionKey(other.name) === getStepSectionKey(block.name)).length}`,
  );

  const applyMove = (
    moved: { steps: string[]; sections: (string | null)[] },
    movedIds: string[],
    message: string,
  ) => {
    const isChanged =
      moved.steps.some((step, at) => step !== steps[at]) ||
      moved.sections.some((section, at) => section !== sections[at]);
    if (!isChanged) return false;
    const before = { steps, sections, ids };
    keepIds(movedIds);
    onChange(moved.steps, moved.sections);
    setOpenStep((current) =>
      current === null ? null : movedIds.indexOf(before.ids[current]),
    );
    onRemoved(message, () => {
      keepIds(before.ids);
      setOpenStep(null);
      latest.current.onChange(before.steps, before.sections);
    });
    return true;
  };

  /** Returns the step's index after the move. */
  const moveStepTo = (index: number, slot: ReorderSlot) => {
    const list = { steps, sections };
    const moved = moveStep(list, index, slot);
    const movedIds = moveStep({ steps: ids, sections }, index, slot).steps;
    applyMove(moved, movedIds, `Moved step ${moved.index + 1}`);
    return moved.index;
  };
  const moveStepBy = (index: number, direction: MoveDirection) => {
    const slot = getStepNeighbourSlot({ steps, sections }, index, direction);
    return slot ? moveStepTo(index, slot) : index;
  };
  const describeMove = (index: number, direction: MoveDirection) =>
    describeStepMove({ steps, sections }, index, direction);

  const moveSectionTo = (from: number, to: number) => {
    const list = { steps, sections };
    const moved = moveStepSection(list, from, to);
    const movedIds = moveStepSection({ steps: ids, sections }, from, to).steps;
    applyMove(moved, movedIds, `Moved “${blocks[from].name ?? ''}”`);
  };
  const getSectionMoveSubtitle = (at: number, direction: MoveDirection) => {
    if (!canMoveStepSection({ steps, sections }, at, direction)) return null;
    const name = blocks[at + direction].name;
    const place = name === null ? 'the steps with no section' : `“${name}”`;
    return `${direction === -1 ? 'Before' : 'After'} ${place}`;
  };

  const groups: ReorderGroup<StepItem>[] = blocks.map((block, at) => {
    const upSubtitle = getSectionMoveSubtitle(at, -1);
    const downSubtitle = getSectionMoveSubtitle(at, 1);
    return {
      id: blockIds[at],
      label: block.name,
      heading:
        block.name === null ? undefined : (
          <SectionHeading
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
            onMoveUp={upSubtitle ? () => moveSectionTo(at, at - 1) : undefined}
            onMoveDown={
              downSubtitle ? () => moveSectionTo(at, at + 1) : undefined
            }
            upSubtitle={upSubtitle ?? undefined}
            downSubtitle={downSubtitle ?? undefined}
          />
        ),
      items: block.steps.map(({ text, index }) => ({
        id: ids[index],
        index,
        text,
      })),
      isOrdered: true,
      isMovable: block.name !== null,
      isPinnedFirst: block.name === null && at === 0,
      foldedLabel: `${block.name === null ? '' : `${block.name} · `}${countWords(block.steps.length, 'step')}`,
    };
  });

  const renderStep = ({ index, text: step }: StepItem) => (
    <div className='space-y-2'>
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
          <StepMoveChoices
            index={index}
            describeMove={describeMove}
            onMove={(direction) => setOpenStep(moveStepBy(index, direction))}
          />
        </div>
      )}
    </div>
  );

  return (
    <div className='space-y-2'>
      <ReorderList
        groups={groups}
        isPlain
        handleSide='start'
        handleLabel='Move step'
        groupHandleLabel='Move section'
        getItemLabel={(item) =>
          item.text.trim() === ''
            ? `Step ${item.index + 1}`
            : clipAtWord(item.text.trim(), MAX_STEP_LABEL_LENGTH)
        }
        renderRow={renderStep}
        onMove={({ itemId, toGroupId, toIndex }) =>
          moveStepTo(ids.indexOf(itemId), {
            group: blockIds.indexOf(toGroupId),
            index: toIndex,
          })
        }
        onMoveGroup={({ groupId, toIndex }) =>
          moveSectionTo(blockIds.indexOf(groupId), toIndex)
        }
      />
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
          describeMove={describeMove}
          onMove={moveStepBy}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  );
}

export default RecipeSteps;

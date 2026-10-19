import { useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { Plus } from 'lucide-react';

import { COMPACT_INPUT_CLASS } from '@/components/forms/Field';
import Pill from '@/components/Pill';
import { PillOptions } from '@/components/PillGroup';
import SuggestionChips from '@/components/SuggestionChips';
import SummaryEditor from '@/components/SummaryEditor';
import type { SummaryGroupPosition } from '@/components/summaryGroup';
import { generateUuid } from '@/utils';
import {
  COLLECTION_NOUN,
  COLLECTION_NOUN_PLURAL,
  COLLECTIONS_TITLE,
  MAX_COLLECTION_LABEL_LENGTH,
  MAX_COLLECTIONS,
  MAX_RECIPE_COLLECTIONS,
} from '@apps/pinch/constants';
import type { Collection } from '@apps/pinch/types';
import {
  addCollectionByLabel,
  getChoiceLabels,
  toggleCollection,
  type ChoiceOutcome,
  type CollectionsChoice,
  type CollectionSuggestion,
} from '@apps/pinch/utils/collections';

const getNote = (outcome: ChoiceOutcome, label: string) => {
  if (outcome === 'recipeFull') {
    return `A recipe can be in ${MAX_RECIPE_COLLECTIONS} ${COLLECTION_NOUN_PLURAL}. Take one off to add another.`;
  }
  if (outcome === 'collectionsFull') {
    return `You have ${MAX_COLLECTIONS} ${COLLECTION_NOUN_PLURAL}, the most Pinch keeps. Delete one to make room.`;
  }
  if (outcome === 'already') return `“${label}” is already picked.`;
  return null;
};

interface CollectionsEditorProps {
  value: CollectionsChoice;
  onChange: (value: CollectionsChoice) => void;
  collections: Collection[];
  suggestions: CollectionSuggestion[];
}

function CollectionsEditor({
  value,
  onChange,
  collections,
  suggestions,
}: CollectionsEditorProps) {
  const hasNone = collections.length + value.added.length === 0;
  const [isCreating, setIsCreating] = useState(hasNone);
  const [hasTappedNew, setHasTappedNew] = useState(false);
  const [typed, setTyped] = useState('');
  const [note, setNote] = useState<string | null>(null);

  const isFull = collections.length + value.added.length >= MAX_COLLECTIONS;
  const options = [...value.added, ...collections].map((entry) => ({
    value: entry.id,
    label: entry.label,
  }));

  const apply = (
    change: ReturnType<typeof toggleCollection>,
    label: string,
  ) => {
    onChange(change.choice);
    setNote(getNote(change.outcome, label));
  };
  const addTyped = () => {
    const change = addCollectionByLabel(
      value,
      collections,
      typed,
      generateUuid,
    );
    apply(change, typed.trim());
    if (change.outcome === 'ok' || change.outcome === 'already') setTyped('');
  };
  const addSuggestion = (label: string) => {
    const suggestion = suggestions.find((entry) => entry.label === label);
    if (!suggestion) return;
    apply(
      suggestion.collectionId
        ? toggleCollection(value, suggestion.collectionId)
        : addCollectionByLabel(value, collections, label, generateUuid),
      label,
    );
  };

  return (
    <div className='space-y-3'>
      <PillOptions
        label={COLLECTIONS_TITLE}
        options={options}
        selectedCount={value.ids.length}
        isSelected={(id) => value.ids.includes(id)}
        onToggle={(id) =>
          apply(
            toggleCollection(value, id),
            options.find((option) => option.value === id)?.label ?? '',
          )
        }
        leading={
          !isFull && (
            <Pill
              isSelected={isCreating}
              className='border-primary/60 border border-dashed'
              onClick={() => {
                setIsCreating((current) => !current);
                setHasTappedNew(true);
              }}
            >
              <Plus className='h-3.5 w-3.5' aria-hidden='true' />
              {`New ${COLLECTION_NOUN}`}
            </Pill>
          )
        }
      />
      {isCreating && !isFull && (
        <div className='flex items-center gap-2'>
          <Input
            value={typed}
            autoFocus={hasTappedNew}
            variant='outline'
            aria-label={`Name the new ${COLLECTION_NOUN}`}
            placeholder='Bulk'
            maxLength={MAX_COLLECTION_LABEL_LENGTH}
            className={COMPACT_INPUT_CLASS}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              event.stopPropagation();
              addTyped();
            }}
          />
          <Button
            type='button'
            variant='secondary'
            className='h-10 shrink-0'
            disabled={typed.trim() === ''}
            onClick={addTyped}
          >
            Add
          </Button>
        </div>
      )}
      {hasNone && (
        <p className='text-muted-foreground text-sm'>
          {`Group recipes your own way, like Weeknight or Bulk. A recipe can be in as many ${COLLECTION_NOUN_PLURAL} as you like.`}
        </p>
      )}
      {isFull && (
        <p className='text-muted-foreground text-xs'>
          {getNote('collectionsFull', '')}
        </p>
      )}
      {note && !isFull && (
        <p className='text-muted-foreground text-xs' role='status'>
          {note}
        </p>
      )}
      {suggestions.length > 0 && (
        <SuggestionChips
          label='Suggested for this recipe'
          suggestions={suggestions.map((entry) => entry.label)}
          onPick={addSuggestion}
        />
      )}
    </div>
  );
}

interface RecipeCollectionsFieldProps {
  value: CollectionsChoice;
  onChange: (value: CollectionsChoice) => void;
  collections: Collection[];
  suggestions: CollectionSuggestion[];
  position: SummaryGroupPosition;
}

function RecipeCollectionsField({
  value,
  onChange,
  collections,
  suggestions,
  position,
}: RecipeCollectionsFieldProps) {
  const labels = getChoiceLabels(value, collections);
  const placeholder =
    suggestions.length > 0
      ? `Suggested: ${suggestions.map((entry) => entry.label).join(', ')}`
      : `Add to a ${COLLECTION_NOUN}`;

  return (
    <SummaryEditor
      label={COLLECTIONS_TITLE}
      groupPosition={position}
      icon='🗂️'
      title={COLLECTIONS_TITLE}
      summary={labels.join(', ')}
      placeholder={placeholder}
      lines={2}
      shouldFocus={false}
    >
      <CollectionsEditor
        value={value}
        onChange={onChange}
        collections={collections}
        suggestions={suggestions}
      />
    </SummaryEditor>
  );
}

export default RecipeCollectionsField;

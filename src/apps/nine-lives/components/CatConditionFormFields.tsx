import { useMemo, useState } from 'react';

import { Badge, Button, Form, FormFactories, HelpIcon, Label, Select } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { createDateInputField, fromDateInputValue, toDateInputValue } from '@/utils';

import type { CatCondition, ConditionCategory, LibraryCondition } from '../types';
import ConditionLibraryBrowser from './ConditionLibraryBrowser';

interface CatConditionFormValues {
  name: string;
  category: ConditionCategory;
  description: string;
  isResolved: boolean;
  occurredAt: string;
  resolvedAt: string;
}

interface CatConditionFormFieldsProps {
  libraryConditions: LibraryCondition[];
  /** When provided, renders a required "Cat" selector so the form isn't tied to one cat. */
  catOptions?: { label: string; value: string }[];
  initialCondition?: Partial<CatCondition> | null;
  isSubmitting?: boolean;
  onSubmit: (
    condition: Partial<CatCondition> & Pick<CatCondition, 'name' | 'category' | 'status' | 'occurredAt'>,
  ) => Promise<void> | void;
  onDelete?: (conditionId: string) => Promise<void> | void;
  onCancel?: () => void;
}

const CONDITION_CATEGORIES: ConditionCategory[] = [
  'illness',
  'injury',
  'chronic',
  'parasite',
  'allergy',
  'other',
];

const STATUS_OPTIONS = [
  { text: 'Active', value: 'active' },
  { text: 'Ongoing', value: 'ongoing' },
  { text: 'Resolved', value: 'resolved' },
];

const mutedLinkClassName = 'text-muted-foreground hover:text-foreground px-0';

const { input, select, textarea, checkbox, custom } = FormFactories;

function CatConditionFormFields({
  libraryConditions,
  catOptions,
  initialCondition,
  isSubmitting = false,
  onSubmit,
  onDelete,
  onCancel,
}: CatConditionFormFieldsProps) {
  const { confirm } = useActionModal();
  const isEditing = Boolean(initialCondition?.id);
  const formId = initialCondition?.id ?? 'new-nine-lives-cat-condition';
  const showCatField = Boolean(catOptions && catOptions.length > 0);

  const [catId, setCatId] = useState(initialCondition?.catId ?? '');
  const [status, setStatus] = useState<CatCondition['status']>(initialCondition?.status ?? 'active');
  const [mode, setMode] = useState<'library' | 'custom'>(
    initialCondition?.source === 'custom' ? 'custom' : 'library',
  );
  const [selectedLibraryCondition, setSelectedLibraryCondition] = useState<LibraryCondition | null>(
    () => libraryConditions.find((condition) => condition.id === initialCondition?.libraryConditionId) ?? null,
  );
  const [notesOpen, setNotesOpen] = useState(Boolean(initialCondition?.description));
  const [isResolved, setIsResolved] = useState(Boolean(initialCondition?.resolvedAt));

  const hasChosenCondition = mode === 'custom' || Boolean(selectedLibraryCondition);

  const fields = useMemo(
    () => [
      ...(mode === 'custom'
        ? [
            input({
              name: 'name',
              label: 'Condition name',
              required: true,
              variant: 'outline',
            }),
            custom({
              name: '_backToLibrary',
              label: '',
              renderComponent: () => (
                <div className='-mt-3 flex justify-end'>
                  <Button
                    type='button'
                    variant='link'
                    size='sm'
                    className={join('text-xs', mutedLinkClassName)}
                    onClick={() => setMode('library')}
                  >
                    Search the library instead
                  </Button>
                </div>
              ),
            }),
            select({
              name: 'category',
              label: 'Category',
              options: CONDITION_CATEGORIES.map((category) => ({ label: category, value: category })),
            }),
          ]
        : []),
      createDateInputField({
        name: 'occurredAt',
        label: 'Occurred date',
        required: true,
        variant: 'outline',
      }),
      notesOpen
        ? textarea({
            name: 'description',
            label: 'Notes (optional)',
            rows: 3,
            variant: 'outline',
          })
        : custom({
            name: '_addNotes',
            label: '',
            renderComponent: () => (
              <Button
                type='button'
                variant='link'
                size='sm'
                className={mutedLinkClassName}
                onClick={() => setNotesOpen(true)}
              >
                + Add notes
              </Button>
            ),
          }),
      checkbox({
        name: 'isResolved',
        label: '',
        text: 'This condition has been resolved',
      }),
      ...(isResolved
        ? [
            createDateInputField({
              name: 'resolvedAt',
              label: 'Resolved date',
              required: true,
              variant: 'outline',
            }),
          ]
        : []),
    ],
    [mode, notesOpen, isResolved],
  );

  const handleSubmit = async (data: CatConditionFormValues) => {
    const occurredAt = fromDateInputValue(data.occurredAt) ?? null;

    if (occurredAt === null || (showCatField && !catId)) {
      return;
    }

    const resolvedAt = data.isResolved ? (fromDateInputValue(data.resolvedAt) ?? null) : null;

    if (mode === 'custom') {
      const trimmedName = data.name.trim();

      if (!trimmedName) {
        return;
      }

      await onSubmit({
        id: initialCondition?.id,
        catId: catId || initialCondition?.catId,
        source: 'custom',
        libraryConditionId: null,
        name: trimmedName,
        category: data.category,
        description: data.description.trim() || null,
        status,
        occurredAt,
        resolvedAt,
      });

      return;
    }

    if (!selectedLibraryCondition) {
      return;
    }

    await onSubmit({
      id: initialCondition?.id,
      catId: catId || initialCondition?.catId,
      source: 'library',
      libraryConditionId: selectedLibraryCondition.id,
      name: selectedLibraryCondition.name,
      category: selectedLibraryCondition.category,
      description: data.description.trim() || selectedLibraryCondition.description || null,
      status,
      occurredAt,
      resolvedAt,
    });
  };

  const handleDelete = async () => {
    if (!initialCondition?.id || !onDelete) {
      return;
    }

    const confirmed = await confirm({
      title: 'Delete condition',
      message: `Are you sure you want to delete ${initialCondition.name ?? 'this condition'}?`,
      destructive: true,
    });

    if (confirmed) {
      await onDelete(initialCondition.id);
    }
  };

  return (
    <div className='space-y-4'>
      {showCatField && (
        <div className='max-w-40 space-y-1'>
          <Label className='text-sm'>Cat</Label>
          <Select
            options={(catOptions ?? []).map((option) => ({ text: option.label, value: option.value }))}
            value={catId}
            placeholder='Select a cat'
            onChange={(value) => setCatId(value)}
          />
        </div>
      )}

      <div className='max-w-40 space-y-1'>
        <div className='flex items-center space-x-1'>
          <Label className='text-sm'>Status</Label>
          <HelpIcon
            message={
              <div>
                <p className='mb-1 font-semibold'>Condition status</p>
                <ul className='space-y-1 text-xs'>
                  <li>• Active: newly logged or currently flaring up</li>
                  <li>• Ongoing: known and being managed long-term</li>
                  <li>• Resolved: no longer affecting the cat</li>
                </ul>
              </div>
            }
            placement='bottom'
          />
        </div>
        <Select
          options={STATUS_OPTIONS}
          value={status}
          onChange={(value) => setStatus(value as CatCondition['status'])}
        />
      </div>

      {mode === 'library' && !selectedLibraryCondition && (
        <div className='space-y-3'>
          <ConditionLibraryBrowser
            conditions={libraryConditions}
            selectedConditionId={null}
            onSelect={(condition) => setSelectedLibraryCondition(condition)}
          />
          <Button type='button' variant='link' size='sm' className={mutedLinkClassName} onClick={() => setMode('custom')}>
            Don&rsquo;t see your condition? Add a custom one
          </Button>
        </div>
      )}

      {mode === 'library' && selectedLibraryCondition && (
        <div className='flex items-center justify-between gap-2 rounded-md border border-border bg-background p-3'>
          <div>
            <div className='flex items-center gap-2'>
              <strong className='text-sm'>{selectedLibraryCondition.name}</strong>
              <Badge variant='muted' outline>
                {selectedLibraryCondition.category}
              </Badge>
            </div>
            <p className='text-muted-foreground text-sm'>{selectedLibraryCondition.description}</p>
          </div>
          <Button
            type='button'
            variant='link'
            size='sm'
            className={mutedLinkClassName}
            onClick={() => setSelectedLibraryCondition(null)}
          >
            Change
          </Button>
        </div>
      )}

      {hasChosenCondition && (
        <Form
          key={`${formId}-${mode}`}
          id={formId}
          form={fields}
          initialData={{
            name: initialCondition?.name ?? '',
            category: initialCondition?.category ?? 'illness',
            description: initialCondition?.description ?? '',
            isResolved,
            occurredAt: toDateInputValue(initialCondition?.occurredAt ?? undefined),
            resolvedAt: toDateInputValue(initialCondition?.resolvedAt ?? undefined),
          }}
          columns={1}
          spacing='normal'
          onDataChange={(data) => {
            const nextIsResolved = Boolean((data as CatConditionFormValues).isResolved);

            if (nextIsResolved !== isResolved) {
              setIsResolved(nextIsResolved);
              setStatus(nextIsResolved ? 'resolved' : 'active');
            }
          }}
          onSubmit={(data) => {
            void handleSubmit(data as CatConditionFormValues);
          }}
          submitButton={
            <div className='flex items-center justify-between gap-2'>
              <div className='flex items-center gap-2'>
                {isEditing && onDelete && (
                  <Button
                    type='button'
                    variant='secondary'
                    onClick={() => void handleDelete()}
                    disabled={isSubmitting}
                  >
                    Delete
                  </Button>
                )}
              </div>
              <div className='flex items-center gap-2'>
                {onCancel && (
                  <Button type='button' variant='secondary' onClick={onCancel} disabled={isSubmitting}>
                    Cancel
                  </Button>
                )}
                <Button type='submit' loading={isSubmitting}>
                  {isSubmitting ? 'Saving…' : isEditing ? 'Save condition' : 'Add condition'}
                </Button>
              </div>
            </div>
          }
        />
      )}
    </div>
  );
}

export default CatConditionFormFields;

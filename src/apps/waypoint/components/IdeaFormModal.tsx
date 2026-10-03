import { useMemo, useState } from 'react';

import {
  Button,
  Checkbox,
  Form,
  FormFactories,
  Input,
  Modal,
  Textarea,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { CalendarDays, Link2, StickyNote, Sun, Utensils } from 'lucide-react';

import AddFieldChips, { RemovableField } from '@/components/forms/AddFieldChips';
import LinkAttachField from '@/components/forms/LinkAttachField';
import { getDayOptions } from '@/utils/dateRangeUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { isValidHttpUrl } from '@/utils/urlUtils';
import DeleteIconButton from '@/components/DeleteIconButton';
import ModalFooterActions from '@/components/ModalFooterActions';
import {
  ACTIVITY_SETTING_LABELS,
  IDEA_TYPE_EMOJIS,
  IDEA_TYPE_LABELS,
  IDEA_TYPES,
  TIME_BLOCK_LABELS,
  TIME_BLOCKS,
} from '@apps/waypoint/constants';
import type {
  ActivitySetting,
  IdeaDetails,
  IdeaType,
  TimeBlock,
  TripIdea,
  TripSpace,
} from '@apps/waypoint/types';

interface Reveal<T> {
  enabled: boolean;
  value: T;
}

interface IdeaExtras {
  link: Reveal<string> & { draft: string };
  details: Reveal<{ cuisines: string; settings: ActivitySetting[] }>;
  when: Reveal<{ days: number[]; blocks: TimeBlock[] }>;
  note: Reveal<string>;
}

interface IdeaFormData {
  ideaType: IdeaType;
  title: string;
  extras: IdeaExtras;
}

export interface IdeaFormFields {
  ideaType: IdeaType;
  title: string;
  linkUrl: string | null;
  notes: string | null;
  ideaDetails: IdeaDetails | null;
}

interface IdeaFormModalProps {
  isOpen: boolean;
  trip: TripSpace;
  defaultType: IdeaType;
  canPost: boolean;
  idea?: TripIdea | null;
  isSubmitting?: boolean;
  onSubmit: (fields: IdeaFormFields) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onClose: () => void;
}

const { custom, input, select } = FormFactories;

const typeOptions = IDEA_TYPES.map((value) => ({
  value,
  label: `${IDEA_TYPE_EMOJIS[value]} ${IDEA_TYPE_LABELS[value]}`,
}));

const EMPTY_EXTRAS: IdeaExtras = {
  link: { enabled: false, value: '', draft: '' },
  details: { enabled: false, value: { cuisines: '', settings: [] } },
  when: { enabled: false, value: { days: [], blocks: [] } },
  note: { enabled: false, value: '' },
};

const toggleItem = <T,>(items: T[], item: T, isChecked: boolean) =>
  isChecked ? [...items, item] : items.filter((existing) => existing !== item);

const parseCuisines = (value: string) =>
  value
    .split(',')
    .map((cuisine) => cuisine.trim())
    .filter(Boolean)
    .filter(
      (cuisine, index, all) =>
        all.findIndex((other) => other.toLowerCase() === cuisine.toLowerCase()) === index,
    );

const getInitialData = (ideaType: IdeaType, idea: TripIdea | null): IdeaFormData => {
  if (!idea) {
    return { ideaType, title: '', extras: EMPTY_EXTRAS };
  }

  const details = idea.ideaDetails;
  const days = details?.suggestedDays ?? [];
  const blocks = details?.suggestedTimeBlocks ?? [];
  const cuisines = details && 'cuisines' in details ? details.cuisines.join(', ') : '';
  const settings = details && 'settings' in details ? details.settings : [];
  return {
    ideaType: idea.ideaType,
    title: idea.title,
    extras: {
      link: { enabled: idea.linkUrl !== null, value: idea.linkUrl ?? '', draft: idea.linkUrl ?? '' },
      details: {
        enabled: cuisines !== '' || settings.length > 0,
        value: { cuisines, settings },
      },
      when: { enabled: days.length > 0 || blocks.length > 0, value: { days, blocks } },
      note: { enabled: idea.notes !== null, value: idea.notes ?? '' },
    },
  };
};

const getIdeaDetails = ({ ideaType, extras }: IdeaFormData): IdeaDetails => {
  const when = extras.when.enabled
    ? { suggestedDays: extras.when.value.days, suggestedTimeBlocks: extras.when.value.blocks }
    : { suggestedDays: [], suggestedTimeBlocks: [] };
  if (ideaType === 'RESTAURANT') {
    return {
      ...when,
      cuisines: extras.details.enabled ? parseCuisines(extras.details.value.cuisines) : [],
    };
  }
  return { ...when, settings: extras.details.enabled ? extras.details.value.settings : [] };
};

interface IdeaExtrasFieldsProps {
  extras: IdeaExtras;
  isRestaurant: boolean;
  trip: TripSpace;
  onChange: (extras: IdeaExtras) => void;
}

function IdeaExtrasFields({ extras, isRestaurant, trip, onChange }: IdeaExtrasFieldsProps) {
  const detailsLabel = isRestaurant ? 'Cuisine' : 'Indoor / outdoor';
  const chips = [
    { key: 'link', label: 'Link', icon: <Link2 className='h-4 w-4' /> },
    {
      key: 'details',
      label: detailsLabel,
      icon: isRestaurant ? <Utensils className='h-4 w-4' /> : <Sun className='h-4 w-4' />,
    },
    { key: 'when', label: 'Best day or time', icon: <CalendarDays className='h-4 w-4' /> },
    { key: 'note', label: 'Note', icon: <StickyNote className='h-4 w-4' /> },
  ].filter((chip) => !extras[chip.key as keyof IdeaExtras].enabled);

  const reveal = (key: string) =>
    onChange({ ...extras, [key]: { ...extras[key as keyof IdeaExtras], enabled: true } });
  const remove = (key: keyof IdeaExtras) => onChange({ ...extras, [key]: EMPTY_EXTRAS[key] });

  return (
    <div className='space-y-4'>
      {extras.link.enabled && (
        <RemovableField label='Link' removeLabel='Remove link' onRemove={() => remove('link')}>
          <LinkAttachField
            url={extras.link.value}
            preview={null}
            label=''
            startRevealed
            onChange={(url) => onChange({ ...extras, link: { enabled: true, value: url, draft: url } })}
            onDraftChange={(draft) =>
              onChange({ ...extras, link: { ...extras.link, enabled: true, draft } })
            }
          />
        </RemovableField>
      )}
      {extras.details.enabled && (
        <RemovableField
          label={detailsLabel}
          removeLabel={`Remove ${detailsLabel.toLowerCase()}`}
          onRemove={() => remove('details')}
        >
          {isRestaurant ? (
            <Input
              variant='outline'
              placeholder='Ramen, Japanese'
              value={extras.details.value.cuisines}
              onChange={(changeEvent) =>
                onChange({
                  ...extras,
                  details: {
                    ...extras.details,
                    value: { ...extras.details.value, cuisines: changeEvent.target.value },
                  },
                })
              }
            />
          ) : (
            <div className='flex flex-wrap gap-4'>
              {(Object.keys(ACTIVITY_SETTING_LABELS) as ActivitySetting[]).map((setting) => (
                <label key={setting} className='flex items-center gap-2 text-sm'>
                  <Checkbox
                    checked={extras.details.value.settings.includes(setting)}
                    onCheckedChange={(checked) =>
                      onChange({
                        ...extras,
                        details: {
                          ...extras.details,
                          value: {
                            ...extras.details.value,
                            settings: toggleItem(
                              extras.details.value.settings,
                              setting,
                              checked === true,
                            ),
                          },
                        },
                      })
                    }
                  />
                  {ACTIVITY_SETTING_LABELS[setting]}
                </label>
              ))}
            </div>
          )}
        </RemovableField>
      )}
      {extras.when.enabled && (
        <RemovableField
          label='Best day or time'
          removeLabel='Remove best day or time'
          onRemove={() => remove('when')}
        >
          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='space-y-1.5'>
              {getDayOptions(trip.startDate, trip.endDate).map(({ value, label }) => (
                <label key={value} className='flex items-center gap-2 text-sm'>
                  <Checkbox
                    checked={extras.when.value.days.includes(Number(value))}
                    onCheckedChange={(checked) =>
                      onChange({
                        ...extras,
                        when: {
                          ...extras.when,
                          value: {
                            ...extras.when.value,
                            days: toggleItem(extras.when.value.days, Number(value), checked === true),
                          },
                        },
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className='space-y-1.5'>
              {TIME_BLOCKS.map((block) => (
                <label key={block} className='flex items-center gap-2 text-sm'>
                  <Checkbox
                    checked={extras.when.value.blocks.includes(block)}
                    onCheckedChange={(checked) =>
                      onChange({
                        ...extras,
                        when: {
                          ...extras.when,
                          value: {
                            ...extras.when.value,
                            blocks: toggleItem(extras.when.value.blocks, block, checked === true),
                          },
                        },
                      })
                    }
                  />
                  {TIME_BLOCK_LABELS[block]}
                </label>
              ))}
            </div>
          </div>
        </RemovableField>
      )}
      {extras.note.enabled && (
        <RemovableField label='Note' removeLabel='Remove note' onRemove={() => remove('note')}>
          <Textarea
            rows={2}
            variant='outline'
            value={extras.note.value}
            onChange={(changeEvent) =>
              onChange({ ...extras, note: { enabled: true, value: changeEvent.target.value } })
            }
          />
        </RemovableField>
      )}
      <AddFieldChips chips={chips} onAdd={reveal} />
    </div>
  );
}

function IdeaFormModal({
  isOpen,
  trip,
  defaultType,
  canPost,
  idea = null,
  isSubmitting = false,
  onSubmit,
  onDelete,
  onClose,
}: IdeaFormModalProps) {
  const { confirm } = useActionModal();
  const initialData = useMemo(() => getInitialData(defaultType, idea), [defaultType, idea]);
  const [formData, setFormData] = useState<IdeaFormData>(initialData);
  const [error, setError] = useState<string | null>(null);

  const isRestaurant = formData.ideaType === 'RESTAURANT';
  const link = formData.extras.link;
  const isLinkValid = !link.enabled || (link.draft.trim() === '' || isValidHttpUrl(link.draft));
  const isFormComplete = formData.title.trim() !== '' && isLinkValid;

  const fields = useMemo(
    () => [
      select({ name: 'ideaType', label: 'Type', options: typeOptions }),
      input({
        name: 'title',
        label: 'Name',
        variant: 'outline',
        placeholder: isRestaurant ? 'Ichiran Ramen' : 'Rattlesnake Ledge hike',
      }),
      custom({
        name: 'extras',
        label: '',
        renderComponent: (props) => (
          <IdeaExtrasFields
            extras={props.value as IdeaExtras}
            isRestaurant={isRestaurant}
            trip={trip}
            onChange={props.onValueChange}
          />
        ),
      }),
    ],
    [isRestaurant, trip],
  );

  const handleDelete = async () => {
    if (!onDelete || !idea) {
      return;
    }

    const confirmed = await confirm({
      title: 'Delete idea',
      message:
        idea.convertedToEntityId === null
          ? `Delete "${idea.title}"? This action cannot be undone.`
          : `Delete "${idea.title}"? It's already on the itinerary, and that event stays exactly as it is.`,
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    try {
      await onDelete();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, 'Unable to delete this idea.'));
    }
  };

  const handleSubmit = async (data: IdeaFormData) => {
    setError(null);
    const { extras } = data;
    try {
      await onSubmit({
        ideaType: data.ideaType,
        title: data.title,
        linkUrl: extras.link.enabled ? extras.link.draft.trim() || null : null,
        notes: extras.note.enabled ? extras.note.value.trim() || null : null,
        ideaDetails: getIdeaDetails(data),
      });
    } catch (submitError) {
      setError(getErrorMessage(submitError, idea ? 'Unable to save this idea.' : 'Unable to post this idea.'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='Idea'>
      <Form
        id='waypoint-idea'
        form={fields}
        initialData={initialData}
        columns={1}
        onDataChange={(data) => setFormData(data as IdeaFormData)}
        onSubmit={(data) => {
          void handleSubmit(data as IdeaFormData);
        }}
        submitButton={
          <ModalFooterActions
            leftActions={
              idea &&
              onDelete && <DeleteIconButton onClick={() => void handleDelete()} disabled={isSubmitting} />
            }
            rightActions={
              <>
                <Button type='button' variant='secondary' onClick={onClose} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button
                  type='submit'
                  loading={isSubmitting}
                  disabled={isSubmitting || !isFormComplete || !canPost}
                >
                  {idea ? 'Save' : 'Post'}
                </Button>
              </>
            }
          />
        }
      />
      {!canPost && (
        <p className='text-muted-foreground mt-3 text-sm'>
          This trip has started, so new ideas can no longer be added.
        </p>
      )}
      {error && <p className='text-destructive mt-3 text-sm'>{error}</p>}
    </Modal>
  );
}

export default IdeaFormModal;

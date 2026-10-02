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
import type { ReactNode } from 'react';

import LinkAttachField from '@/components/forms/LinkAttachField';
import { getDayOptions } from '@/utils/dateRangeUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import ModalFooterActions from '@apps/waypoint/components/ModalFooterActions';
import {
  ACTIVITY_SETTING_LABELS,
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
  TripSpace,
} from '@apps/waypoint/types';

interface Reveal<T> {
  enabled: boolean;
  value: T;
}

interface IdeaFormData {
  ideaType: IdeaType;
  title: string;
  link: Reveal<string>;
  details: Reveal<{ cuisines: string; settings: ActivitySetting[] }>;
  when: Reveal<{ days: number[]; blocks: TimeBlock[] }>;
  note: Reveal<string>;
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
  isSubmitting?: boolean;
  onSubmit: (fields: IdeaFormFields) => Promise<void> | void;
  onClose: () => void;
}

const { custom, input, select } = FormFactories;

const typeOptions = IDEA_TYPES.map((value) => ({ value, label: IDEA_TYPE_LABELS[value] }));

const isHttpUrl = (value: string) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
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

function RevealField({
  isOpen,
  addLabel,
  removeLabel,
  onOpen,
  onRemove,
  children,
}: {
  isOpen: boolean;
  addLabel: string;
  removeLabel: string;
  onOpen: () => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  if (!isOpen) {
    return (
      <Button
        type='button'
        variant='link'
        size='sm'
        className='h-auto p-0 text-xs'
        onClick={onOpen}
      >
        {addLabel}
      </Button>
    );
  }

  return (
    <div className='space-y-2'>
      {children}
      <Button
        type='button'
        variant='link'
        size='sm'
        className='h-auto p-0 text-xs'
        onClick={onRemove}
      >
        {removeLabel}
      </Button>
    </div>
  );
}

const getInitialData = (ideaType: IdeaType): IdeaFormData => ({
  ideaType,
  title: '',
  link: { enabled: false, value: '' },
  details: { enabled: false, value: { cuisines: '', settings: [] } },
  when: { enabled: false, value: { days: [], blocks: [] } },
  note: { enabled: false, value: '' },
});

const getIdeaDetails = (data: IdeaFormData): IdeaDetails => {
  const when = data.when.enabled
    ? { suggestedDays: data.when.value.days, suggestedTimeBlocks: data.when.value.blocks }
    : { suggestedDays: [], suggestedTimeBlocks: [] };
  if (data.ideaType === 'RESTAURANT') {
    return {
      ...when,
      cuisines: data.details.enabled ? parseCuisines(data.details.value.cuisines) : [],
    };
  }
  return { ...when, settings: data.details.enabled ? data.details.value.settings : [] };
};

function IdeaFormModal({
  isOpen,
  trip,
  defaultType,
  isSubmitting = false,
  onSubmit,
  onClose,
}: IdeaFormModalProps) {
  const initialData = useMemo(() => getInitialData(defaultType), [defaultType]);
  const [formData, setFormData] = useState<IdeaFormData>(initialData);
  const [error, setError] = useState<string | null>(null);

  const isRestaurant = formData.ideaType === 'RESTAURANT';
  const isLinkValid = !formData.link.enabled || formData.link.value.trim() === '' || isHttpUrl(formData.link.value.trim());
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
        name: 'link',
        label: 'Link',
        renderComponent: (props) => {
          const link = props.value as Reveal<string>;
          return (
            <LinkAttachField
              url={link.value}
              preview={null}
              label='Link'
              addLabel='+ Add link'
              placeholder='https://…'
              onChange={(url) => props.onValueChange({ enabled: url !== '' || link.enabled, value: url })}
            />
          );
        },
      }),
      custom({
        name: 'details',
        label: isRestaurant ? 'Cuisine' : 'Setting',
        renderComponent: (props) => {
          const details = props.value as IdeaFormData['details'];
          return (
            <RevealField
              isOpen={details.enabled}
              addLabel={isRestaurant ? '+ Add cuisine' : '+ Add indoor or outdoor'}
              removeLabel={isRestaurant ? 'Remove cuisine' : 'Remove setting'}
              onOpen={() => props.onValueChange({ ...details, enabled: true })}
              onRemove={() => props.onValueChange({ ...details, enabled: false })}
            >
              {isRestaurant ? (
                <Input
                  variant='outline'
                  placeholder='Ramen, Japanese'
                  value={details.value.cuisines}
                  onChange={(changeEvent) =>
                    props.onValueChange({
                      ...details,
                      value: { ...details.value, cuisines: changeEvent.target.value },
                    })
                  }
                />
              ) : (
                <div className='flex flex-wrap gap-4'>
                  {(Object.keys(ACTIVITY_SETTING_LABELS) as ActivitySetting[]).map((setting) => (
                    <label key={setting} className='flex items-center gap-2 text-sm'>
                      <Checkbox
                        checked={details.value.settings.includes(setting)}
                        onCheckedChange={(checked) =>
                          props.onValueChange({
                            ...details,
                            value: {
                              ...details.value,
                              settings: toggleItem(details.value.settings, setting, checked === true),
                            },
                          })
                        }
                      />
                      {ACTIVITY_SETTING_LABELS[setting]}
                    </label>
                  ))}
                </div>
              )}
            </RevealField>
          );
        },
      }),
      custom({
        name: 'when',
        label: 'Best day and time',
        renderComponent: (props) => {
          const when = props.value as IdeaFormData['when'];
          return (
            <RevealField
              isOpen={when.enabled}
              addLabel='+ Add best day or time'
              removeLabel='Remove best day or time'
              onOpen={() => props.onValueChange({ ...when, enabled: true })}
              onRemove={() => props.onValueChange({ ...when, enabled: false })}
            >
              <div className='grid gap-3 sm:grid-cols-2'>
                <div className='space-y-1.5'>
                  {getDayOptions(trip.startDate, trip.endDate).map(({ value, label }) => (
                    <label key={value} className='flex items-center gap-2 text-sm'>
                      <Checkbox
                        checked={when.value.days.includes(Number(value))}
                        onCheckedChange={(checked) =>
                          props.onValueChange({
                            ...when,
                            value: {
                              ...when.value,
                              days: toggleItem(when.value.days, Number(value), checked === true),
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
                        checked={when.value.blocks.includes(block)}
                        onCheckedChange={(checked) =>
                          props.onValueChange({
                            ...when,
                            value: {
                              ...when.value,
                              blocks: toggleItem(when.value.blocks, block, checked === true),
                            },
                          })
                        }
                      />
                      {TIME_BLOCK_LABELS[block]}
                    </label>
                  ))}
                </div>
              </div>
            </RevealField>
          );
        },
      }),
      custom({
        name: 'note',
        label: 'Note',
        renderComponent: (props) => {
          const note = props.value as Reveal<string>;
          return (
            <RevealField
              isOpen={note.enabled}
              addLabel='+ Add note'
              removeLabel='Remove note'
              onOpen={() => props.onValueChange({ ...note, enabled: true })}
              onRemove={() => props.onValueChange({ enabled: false, value: '' })}
            >
              <Textarea
                rows={2}
                variant='outline'
                value={note.value}
                onChange={(changeEvent) =>
                  props.onValueChange({ ...note, value: changeEvent.target.value })
                }
              />
            </RevealField>
          );
        },
      }),
    ],
    [isRestaurant, trip.startDate, trip.endDate],
  );

  const handleSubmit = async (data: IdeaFormData) => {
    setError(null);
    try {
      await onSubmit({
        ideaType: data.ideaType,
        title: data.title,
        linkUrl: data.link.enabled ? data.link.value.trim() || null : null,
        notes: data.note.enabled ? data.note.value.trim() || null : null,
        ideaDetails: getIdeaDetails(data),
      });
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to post this idea.'));
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
            rightActions={
              <>
                <Button type='button' variant='secondary' onClick={onClose} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button
                  type='submit'
                  loading={isSubmitting}
                  disabled={isSubmitting || !isFormComplete}
                >
                  Post
                </Button>
              </>
            }
          />
        }
      />
      {error && <p className='text-destructive mt-3 text-sm'>{error}</p>}
    </Modal>
  );
}

export default IdeaFormModal;

import { useEffect, useRef, useState, type ReactNode } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Input,
} from '@moondreamsdev/dreamer-ui/components';
import { useQuery } from '@tanstack/react-query';

import FallbackImage from '@/components/FallbackImage';
import Field, { COMPACT_INPUT_CLASS } from '@/components/forms/Field';
import PhotoPicker from '@/components/forms/PhotoPicker';
import ModalFooterActions from '@/components/ModalFooterActions';
import { DEBOUNCE_MS, useDebouncedValue } from '@/hooks/useDebounce';
import { useImageUpload } from '@/hooks/useImageUpload';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { blockEnterSubmit } from '@/utils/formKeyUtils';
import {
  getWebLinkHost,
  hasSeveralWebLinks,
  toWebLink,
} from '@/utils/urlUtils';
import IdeaNoteField from '@apps/pinch/components/ideas/IdeaNoteField';
import { IDEA_KIND_EMOJIS, MAX_IDEA_TITLE_LENGTH } from '@apps/pinch/constants';
import { ideaPageQueryOptions } from '@apps/pinch/queries/ideaPageQueries';
import {
  createIdea,
  type IdeaDraft,
} from '@apps/pinch/store/actions/ideaActions';
import { selectIdeas } from '@apps/pinch/store/selectors';
import {
  clipIdeaTitle,
  clipSiteName,
  findIdeaByUrl,
  toIdeaImageUrl,
  toIdeaUrl,
} from '@apps/pinch/utils/ideas';

const { custom } = FormFactories;

interface WayProps {
  uid: string;
  onClose: () => void;
}

function useCreateIdea(uid: string, onDone: () => void) {
  const dispatch = useAppDispatch();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (draft: IdeaDraft) => {
    setError(null);
    setIsSubmitting(true);
    try {
      await dispatch(createIdea({ uid, draft })).unwrap();
      onDone();
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save this idea.'));
      setIsSubmitting(false);
    }
  };

  return { submit, isSubmitting, error, clearError: () => setError(null) };
}

interface WayFooterProps {
  canSave: boolean;
  isSubmitting: boolean;
  note?: ReactNode;
  error: string | null;
  onCancel: () => void;
}

function WayFooter({
  canSave,
  isSubmitting,
  note,
  error,
  onCancel,
}: WayFooterProps) {
  return (
    <ModalFooterActions
      note={
        note ?? (error && <span className='text-destructive'>{error}</span>)
      }
      cancelAction={
        <Button
          type='button'
          variant='secondary'
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
      }
      rightActions={
        <Button
          type='submit'
          formNoValidate
          loading={isSubmitting}
          disabled={isSubmitting || !canSave}
        >
          Save idea
        </Button>
      }
    />
  );
}

interface TitleFieldProps {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  isCompact?: boolean;
}

function TitleField({
  label,
  value,
  placeholder,
  onChange,
  isCompact = false,
}: TitleFieldProps) {
  return (
    <div onKeyDown={blockEnterSubmit}>
      <Field label={label} isCompact={isCompact}>
        {(id) => (
          <Input
            id={id}
            variant='outline'
            className={isCompact ? COMPACT_INPUT_CLASS : undefined}
            maxLength={MAX_IDEA_TITLE_LENGTH}
            placeholder={placeholder}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
      </Field>
    </div>
  );
}

interface LinkWayProps extends WayProps {
  onOpenExisting: (id: string) => void;
}

export function IdeaLinkWay({ uid, onClose, onOpenExisting }: LinkWayProps) {
  const ideas = useAppSelector(selectIdeas);
  const { submit, isSubmitting, error, clearError } = useCreateIdea(
    uid,
    onClose,
  );
  const bodyRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState({ url: '', note: '' });
  const [typed, setTyped] = useState<{ link: string; title: string } | null>(
    null,
  );

  useEffect(() => {
    const timer = window.setTimeout(
      () => bodyRef.current?.querySelector('input')?.focus(),
      50,
    );
    return () => window.clearTimeout(timer);
  }, []);

  const link = toIdeaUrl(data.url);
  const duplicate = link === null ? null : findIdeaByUrl(ideas, link);
  const settledText = useDebouncedValue(data.url, DEBOUNCE_MS.linkDetection);
  const lookupLink = useDebouncedValue(
    duplicate ? null : link,
    DEBOUNCE_MS.linkDetection,
  );
  const lookup = useQuery({
    ...ideaPageQueryOptions(lookupLink ?? ''),
    enabled: lookupLink !== null,
  });

  const isSettled = lookupLink !== null && lookupLink === link;
  const page = isSettled && lookup.isSuccess ? lookup.data : null;
  const isLooking =
    link !== null && duplicate === null && (!isSettled || lookup.isFetching);
  const hasFailed = isSettled && !lookup.isFetching && lookup.isError;
  const host = link === null ? null : getWebLinkHost(link);
  const pageTitle = clipIdeaTitle(page?.title ?? '');
  const siteName = clipSiteName(page?.meta?.siteName) ?? host;
  const imageUrl = toIdeaImageUrl(page?.meta?.image);
  const title = typed && typed.link === link ? typed.title : pageTitle;
  const isInvalid =
    data.url.trim() !== '' && link === null && settledText === data.url;

  const fields = [
    custom({
      name: 'url',
      label: '',
      renderComponent: (props) => (
        <div className='space-y-2' onKeyDown={blockEnterSubmit}>
          <Field label='Link'>
            {(id) => (
              <Input
                id={id}
                type='url'
                inputMode='url'
                variant='outline'
                autoCapitalize='none'
                autoCorrect='off'
                spellCheck={false}
                placeholder='Paste a link'
                value={String(props.value)}
                onChange={(event) => props.onValueChange(event.target.value)}
                onPaste={(event) => {
                  const pasted = event.clipboardData.getData('text');
                  if (!/\s/.test(pasted.trim())) return;
                  event.preventDefault();
                  props.onValueChange(
                    toWebLink(pasted) ?? pasted.trim().replace(/\s+/g, ' '),
                  );
                }}
              />
            )}
          </Field>
          {isInvalid && (
            <p className='text-destructive text-sm' role='status'>
              {hasSeveralWebLinks(data.url)
                ? 'That looks like more than one link. Paste one at a time.'
                : "That doesn't look like a web link. Paste the address from your browser."}
            </p>
          )}
        </div>
      ),
    }),
    custom({
      name: 'preview',
      label: '',
      renderComponent: () => {
        if (duplicate) {
          return (
            <div
              className='bg-accent border-border flex items-center justify-between gap-3 rounded-2xl border p-3'
              role='status'
            >
              <p className='min-w-0 text-sm'>
                That one's already in your ideas
              </p>
              <Button
                type='button'
                variant='secondary'
                size='sm'
                className='h-10 shrink-0'
                onClick={() => onOpenExisting(duplicate.id)}
              >
                Open it
              </Button>
            </div>
          );
        }
        if (isLooking) {
          return (
            <p className='text-muted-foreground text-sm' role='status'>
              Looking up the page…
            </p>
          );
        }
        if (page === null && !hasFailed) {
          return null;
        }
        return (
          <div className='space-y-2'>
            <div className='flex items-start gap-3'>
              <span
                className='bg-accent grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl text-2xl'
                aria-hidden='true'
              >
                {imageUrl ? (
                  <FallbackImage
                    src={imageUrl}
                    alt=''
                    fallback={IDEA_KIND_EMOJIS.LINK}
                    className='size-full object-cover'
                  />
                ) : (
                  IDEA_KIND_EMOJIS.LINK
                )}
              </span>
              <div className='min-w-0 flex-1 space-y-1'>
                <TitleField
                  label={page ? 'Looks like' : 'Title'}
                  isCompact
                  value={title}
                  placeholder={host ?? ''}
                  onChange={(value) =>
                    setTyped({ link: link ?? '', title: value })
                  }
                />
                {page && siteName && (
                  <p className='text-muted-foreground text-xs wrap-break-word'>
                    {siteName}
                  </p>
                )}
              </div>
            </div>
            {hasFailed && (
              <p className='text-muted-foreground text-sm' role='status'>
                Couldn't read that page. You can type your own title.
              </p>
            )}
          </div>
        );
      },
    }),
    custom({
      name: 'note',
      label: '',
      renderComponent: (props) => (
        <IdeaNoteField
          value={String(props.value)}
          onChange={props.onValueChange}
        />
      ),
    }),
  ];

  const canSave = link !== null && duplicate === null;

  return (
    <div ref={bodyRef} className='space-y-4'>
      <p className='text-muted-foreground text-sm'>
        We fetch the page to find its title and picture. Nothing is saved from
        it except those.
      </p>
      <Form
        id='pinch-idea-link'
        form={fields}
        initialData={{ url: '', note: '' }}
        columns={1}
        onDataChange={(next) => {
          setData(next as typeof data);
          clearError();
        }}
        onSubmit={() => {
          if (!canSave) return;
          void submit({
            kind: 'LINK',
            title,
            note: data.note,
            url: data.url,
            siteName: page ? siteName : null,
            imageUrl,
            photoFile: null,
          });
        }}
        submitButton={
          <WayFooter
            canSave={canSave}
            isSubmitting={isSubmitting}
            error={error}
            onCancel={onClose}
          />
        }
      />
    </div>
  );
}

export function IdeaPhotoWay({ uid, onClose }: WayProps) {
  const { submit, isSubmitting, error, clearError } = useCreateIdea(
    uid,
    onClose,
  );
  const upload = useImageUpload(null);
  const { pick, clear } = upload;
  const [data, setData] = useState({ title: '', note: '' });

  const title = data.title.trim();
  const canSave = upload.file !== null && title !== '';

  const fields = [
    custom({
      name: 'photo',
      label: '',
      renderComponent: () => (
        <div className='space-y-2'>
          <span className='block text-sm font-medium'>Picture</span>
          <div className='flex items-center gap-4'>
            <span
              className='bg-accent grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl text-4xl'
              aria-hidden='true'
            >
              {upload.previewUrl ? (
                <FallbackImage
                  src={upload.previewUrl}
                  alt=''
                  fallback={IDEA_KIND_EMOJIS.PHOTO}
                  className='size-full object-cover'
                />
              ) : (
                IDEA_KIND_EMOJIS.PHOTO
              )}
            </span>
            <PhotoPicker
              photoUrl={upload.previewUrl}
              showPreview={false}
              uploadLabel='Choose a picture'
              changeLabel='Choose another'
              error={upload.error}
              onSelect={(file) => {
                clearError();
                pick(file);
              }}
              onRemove={clear}
            />
          </div>
        </div>
      ),
    }),
    custom({
      name: 'title',
      label: '',
      renderComponent: (props) => (
        <TitleField
          label='Title'
          placeholder='What is it?'
          value={String(props.value)}
          onChange={props.onValueChange}
        />
      ),
    }),
    custom({
      name: 'note',
      label: '',
      renderComponent: (props) => (
        <IdeaNoteField
          value={String(props.value)}
          onChange={props.onValueChange}
        />
      ),
    }),
  ];

  return (
    <div className='space-y-4'>
      <Form
        id='pinch-idea-photo'
        form={fields}
        initialData={{ title: '', note: '' }}
        columns={1}
        onDataChange={(next) => {
          setData(next as typeof data);
          clearError();
        }}
        onSubmit={() => {
          if (!canSave) return;
          void submit({
            kind: 'PHOTO',
            title,
            note: data.note,
            url: null,
            siteName: null,
            imageUrl: null,
            photoFile: upload.file,
          });
        }}
        submitButton={
          <WayFooter
            canSave={canSave}
            isSubmitting={isSubmitting}
            error={error}
            note={
              upload.file !== null && title === ''
                ? 'Give it a title to save.'
                : null
            }
            onCancel={onClose}
          />
        }
      />
    </div>
  );
}

export function IdeaTextWay({ uid, onClose }: WayProps) {
  const { submit, isSubmitting, error, clearError } = useCreateIdea(
    uid,
    onClose,
  );
  const bodyRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState({ title: '', note: '' });

  useEffect(() => {
    const timer = window.setTimeout(
      () => bodyRef.current?.querySelector('input')?.focus(),
      50,
    );
    return () => window.clearTimeout(timer);
  }, []);

  const title = data.title.trim();
  const canSave = title !== '';

  const fields = [
    custom({
      name: 'title',
      label: '',
      renderComponent: (props) => (
        <TitleField
          label='Title'
          placeholder="Something like Mom's lemon bars"
          value={String(props.value)}
          onChange={props.onValueChange}
        />
      ),
    }),
    custom({
      name: 'note',
      label: '',
      renderComponent: (props) => (
        <IdeaNoteField
          isOpen
          value={String(props.value)}
          onChange={props.onValueChange}
        />
      ),
    }),
  ];

  return (
    <div ref={bodyRef} className='space-y-4'>
      <Form
        id='pinch-idea-text'
        form={fields}
        initialData={{ title: '', note: '' }}
        columns={1}
        onDataChange={(next) => {
          setData(next as typeof data);
          clearError();
        }}
        onSubmit={() => {
          if (!canSave) return;
          void submit({
            kind: 'TEXT',
            title,
            note: data.note,
            url: null,
            siteName: null,
            imageUrl: null,
            photoFile: null,
          });
        }}
        submitButton={
          <WayFooter
            canSave={canSave}
            isSubmitting={isSubmitting}
            error={error}
            onCancel={onClose}
          />
        }
      />
    </div>
  );
}

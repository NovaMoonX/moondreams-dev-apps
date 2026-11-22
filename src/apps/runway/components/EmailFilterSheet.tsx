import { useEffect, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Sparkles } from 'lucide-react';

import AppCheckbox from '@/components/AppCheckbox';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import {
  EMAIL_WORDS,
  describeEmailFilter,
  readSubjectTemplate,
} from '@apps/runway/components/emailWords';
import {
  useEmailActions,
  type EmailEventRead,
  type EmailFilterSuggestion,
} from '@apps/runway/hooks/useEmailPurchases';
import type { EmailFilterSealed } from '@apps/runway/types';
import { getErrorMessage } from '@/utils/errorUtils';

interface EmailFilterSheetProps {
  event: EmailEventRead;
  onClose: () => void;
}

interface Choice {
  key: string;
  title: string;
  detail: string | null;
  filter: EmailFilterSealed;
}

const EMPTY: EmailFilterSealed = {
  fromAddress: null,
  subjectTemplate: null,
  subjectContains: [],
  bodyContains: [],
};

const combine = (filters: readonly EmailFilterSealed[]): EmailFilterSealed =>
  filters.reduce<EmailFilterSealed>(
    (all, next) => ({
      fromAddress: all.fromAddress ?? next.fromAddress,
      subjectTemplate: all.subjectTemplate ?? next.subjectTemplate,
      subjectContains: [...all.subjectContains, ...next.subjectContains],
      bodyContains: [...all.bodyContains, ...next.bodyContains],
    }),
    EMPTY,
  );

/** "Filter out emails like this": the sender and the subject shape at once, an AI's suggestions joining them when it has any; saving writes one filter from whatever is ticked. */
function EmailFilterSheet({ event, onClose }: EmailFilterSheetProps) {
  const actions = useEmailActions();
  const mask = useMaskedText();
  const [suggestions, setSuggestions] = useState<EmailFilterSuggestion[]>([]);
  const [isLooking, setIsLooking] = useState(true);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    actions
      .suggestFilters(event.id)
      .then((found) => {
        if (isCurrent) setSuggestions(found);
      })
      .catch(() => {})
      .finally(() => {
        if (isCurrent) setIsLooking(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [actions, event.id]);

  const isAllowedSuggestion = (suggestion: EmailFilterSuggestion) =>
    event.outcome !== 'purchase' ||
    suggestion.fromAddress === null ||
    suggestion.subjectTemplate !== null ||
    suggestion.subjectContains.length > 0 ||
    suggestion.bodyContains.length > 0;

  const presets: Choice[] = [
    ...(event.from && event.outcome !== 'purchase'
      ? [
          {
            key: 'from',
            title: EMAIL_WORDS.fromSender,
            detail: event.from,
            filter: { ...EMPTY, fromAddress: event.from },
          },
        ]
      : []),
    ...(event.subjectTemplate
      ? [
          {
            key: 'subject',
            title: EMAIL_WORDS.withSubject,
            detail: readSubjectTemplate(event.subjectTemplate),
            filter: { ...EMPTY, subjectTemplate: event.subjectTemplate },
          },
        ]
      : []),
  ];
  const extras: Choice[] = suggestions
    .filter(isAllowedSuggestion)
    .map((suggestion, index) => ({
      key: `s${index}`,
      title: suggestion.label,
      detail: describeEmailFilter(suggestion).name,
      filter: suggestion,
    }));

  const toggle = (key: string, isOn: boolean) =>
    setPicked((current) => {
      const next = new Set(current);
      if (isOn) next.add(key);
      else next.delete(key);
      return next;
    });

  const save = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await actions.createFilter(
        combine(
          [...presets, ...extras]
            .filter((choice) => picked.has(choice.key))
            .map((choice) => choice.filter),
        ),
      );
      onClose();
    } catch (saveError) {
      setError(getErrorMessage(saveError, EMAIL_WORDS.saveFailed));
      setIsSaving(false);
    }
  };

  const row = (choice: Choice, isByAi = false) => (
    <li key={choice.key}>
      <label className='flex min-h-14 items-center gap-3 px-3 py-2'>
        <AppCheckbox
          checked={picked.has(choice.key)}
          onCheckedChange={(next) => toggle(choice.key, next)}
        />
        <span className='block min-w-0 flex-1 text-sm'>
          <span className='block font-medium break-words'>
            {isByAi && (
              <Sparkles
                className='text-muted-foreground mr-1.5 inline h-3.5 w-3.5 align-[-2px]'
                aria-hidden='true'
              />
            )}
            {choice.title}
          </span>
          {choice.detail && (
            <span className='text-muted-foreground block break-words'>
              {mask(choice.detail)}
            </span>
          )}
        </span>
      </label>
    </li>
  );

  return (
    <FormSheet isOpen onClose={onClose} title={EMAIL_WORDS.filterOut}>
      <div className='space-y-4 pb-4'>
        <p className='text-muted-foreground text-sm'>
          {EMAIL_WORDS.filterOutSub}
        </p>
        <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
          {presets.map((choice) => row(choice))}
        </ul>
        {isLooking && (
          <p
            className='text-muted-foreground flex items-center gap-2 text-sm'
            role='status'
          >
            <span
              className='size-4 animate-spin rounded-full border-2 border-current/20 border-t-current motion-reduce:[animation-duration:2.5s]'
              aria-hidden='true'
            />
            <Sparkles className='h-3.5 w-3.5' aria-hidden='true' />
            {EMAIL_WORDS.suggestionsCaption}
          </p>
        )}
        {extras.length > 0 && (
          <div className='space-y-2'>
            <p className='text-muted-foreground text-sm'>
              {EMAIL_WORDS.suggestedByAi}
            </p>
            <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
              {extras.map((choice) => row(choice, true))}
            </ul>
          </div>
        )}
        {error && (
          <p className='text-destructive text-sm' role='alert'>
            {error}
          </p>
        )}
        <ModalFooterActions
          note={picked.size === 0 ? EMAIL_WORDS.pickOne : undefined}
          cancelAction={
            <Button variant='tertiary' onClick={onClose}>
              Cancel
            </Button>
          }
          rightActions={
            <Button
              disabled={picked.size === 0 || isSaving}
              onClick={() => void save()}
            >
              {EMAIL_WORDS.saveFilter}
            </Button>
          }
        />
      </div>
    </FormSheet>
  );
}

export default EmailFilterSheet;
